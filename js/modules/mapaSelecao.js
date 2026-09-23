/* Modo temporário do mapa existente. Não conhece o schema do editor.
   Move o mesmo #mapa-area e a mesma instância Leaflet para um diálogo. */
Object.assign(Mapa, {
    selecaoLocalizacao: null,
    iniciarSelecaoLocalizacao(opcoes) {
        if (!window.Auth?.pode?.("editar")) throw new Error("Edição não permitida.");
        if (this.selecaoLocalizacao) this.cancelarSelecaoLocalizacao();
        const area = document.getElementById("mapa-area");
        if (!area || typeof L === "undefined") throw new Error("Mapa indisponível.");
        const dialog = document.createElement("dialog");
        dialog.className = "mapa-selecao-dialog";
        dialog.setAttribute("aria-labelledby", "mapa-selecao-titulo");
        dialog.innerHTML = `<header class="mapa-selecao-cabecalho"><div><h2 id="mapa-selecao-titulo"></h2>
            <p>Clique ou toque no mapa. Clique novamente ou arraste o marcador para reposicionar.</p></div>
            <button type="button" data-selecao-cancelar aria-label="Cancelar seleção" class="mapa-selecao-fechar">×</button></header>
            <div class="mapa-selecao-conteudo"></div>
            <footer class="mapa-selecao-rodape"><output data-selecao-coordenadas aria-live="polite">Escolha uma posição no mapa.</output>
            <div class="editor-acoes"><button type="button" data-selecao-cancelar>Cancelar seleção</button><button type="button" data-selecao-confirmar class="editor-primario" disabled>Confirmar localização</button></div></footer>`;
        dialog.querySelector("h2").textContent = opcoes.titulo || "Selecionar localização";
        const origem = document.createComment("posição original do mapa");
        area.before(origem);
        const estado = {
            ...opcoes, dialog, area, origem, marcador: null, ponto: null,
            focoAnterior: document.activeElement, contratoAnterior: this.contratoAtivo,
            centroAnterior: this.map?.getCenter(), zoomAnterior: this.map?.getZoom(),
            vazio: document.getElementById("mapa-vazio"), overflowAnterior: document.body.style.overflow
        };
        estado.displayVazio = estado.vazio?.style.display;
        this.selecaoLocalizacao = estado;
        try {
            document.body.append(dialog);
            dialog.querySelector(".mapa-selecao-conteudo").append(area);
            dialog.showModal();
            document.body.style.overflow = "hidden";
            if (estado.vazio) estado.vazio.style.display = "none";
            this.contratoAtivo = opcoes.contratoId || this.contratoAtivo;
            this.iniciarMapa();
            this.map.stop();
            this.map.invalidateSize({ pan: false });
            this.renderFrentes();
            if (!this.map || !this.markersLayer) throw new Error("Mapa não inicializado.");
            this.map.invalidateSize({ pan: false });
            estado.clique = evento => this.atualizarPontoSelecao(evento.latlng);
            this.map.on("click", estado.clique);
            const ponto = validarCoordenadasOM(opcoes.latitudeAtual, opcoes.longitudeAtual);
            if (ponto.valida && !ponto.vazia) {
                this.atualizarPontoSelecao({ lat: ponto.lat, lng: ponto.lng });
                this.map.setView([ponto.lat, ponto.lng], Math.max(this.map.getZoom(), 16), { animate: false });
            } else if (!this.montarMarcadores(Dashboard.contratos[this.contratoAtivo] || {}).length) {
                this.map.setView([this.centroReferencia.lat, this.centroReferencia.lng], 15, { animate: false });
            }
            dialog.querySelectorAll("[data-selecao-cancelar]").forEach(botao => botao.onclick = () => this.cancelarSelecaoLocalizacao());
            dialog.querySelector("[data-selecao-confirmar]").onclick = () => this.confirmarSelecaoLocalizacao();
            dialog.addEventListener("cancel", evento => { evento.preventDefault(); this.cancelarSelecaoLocalizacao(); });
            dialog.addEventListener("close", () => { if (this.selecaoLocalizacao === estado) this.cancelarSelecaoLocalizacao(); });
            requestAnimationFrame(() => { if (this.selecaoLocalizacao === estado) this.map.invalidateSize({ pan: false }); });
        } catch (erro) {
            this.encerrarSelecaoLocalizacao();
            throw erro;
        }
    },
    atualizarPontoSelecao(latlng) {
        const estado = this.selecaoLocalizacao;
        if (!estado || !window.Auth?.pode?.("editar")) return;
        const ponto = validarCoordenadasOM(latlng?.lat, latlng?.lng);
        if (!ponto.valida || ponto.vazia) return;
        estado.ponto = { lat: Number(ponto.lat.toFixed(7)), lng: Number(ponto.lng.toFixed(7)) };
        const coordenadas = [estado.ponto.lat, estado.ponto.lng];
        if (estado.marcador) estado.marcador.setLatLng(coordenadas);
        else {
            estado.marcador = L.marker(coordenadas, {
                icon: this.criarIcone({ status: this.statusConfig[estado.status] ? estado.status : "planejada", frente: "Localização selecionada" }),
                draggable: true, zIndexOffset: 1000, title: "Localização selecionada", alt: "Localização selecionada"
            }).addTo(this.map);
            estado.marcador.on("dragend", () => this.atualizarPontoSelecao(estado.marcador.getLatLng()));
        }
        estado.dialog.querySelector("[data-selecao-coordenadas]").textContent = `Latitude: ${estado.ponto.lat} · Longitude: ${estado.ponto.lng}`;
        estado.dialog.querySelector("[data-selecao-confirmar]").disabled = false;
    },
    confirmarSelecaoLocalizacao() {
        const estado = this.selecaoLocalizacao;
        if (!estado?.ponto) return;
        if (!window.Auth?.pode?.("editar")) { this.cancelarSelecaoLocalizacao(); return; }
        const { lat, lng } = estado.ponto;
        this.encerrarSelecaoLocalizacao();
        estado.aoSelecionar?.(lat, lng);
    },
    cancelarSelecaoLocalizacao() {
        const estado = this.selecaoLocalizacao;
        if (!estado) return;
        this.encerrarSelecaoLocalizacao();
        estado.aoCancelar?.();
    },
    encerrarSelecaoLocalizacao() {
        const estado = this.selecaoLocalizacao;
        if (!estado) return;
        this.selecaoLocalizacao = null;
        if (estado.clique) this.map?.off("click", estado.clique);
        estado.marcador?.remove();
        estado.origem.replaceWith(estado.area);
        if (estado.vazio) estado.vazio.style.display = estado.displayVazio || "";
        estado.dialog.close(); estado.dialog.remove();
        document.body.style.overflow = estado.overflowAnterior;
        this.contratoAtivo = estado.contratoAnterior || estado.contratoId;
        if (this.map && this.markersLayer) {
            this.renderFrentes(false);
            this.map.invalidateSize({ pan: false });
            if (estado.centroAnterior) this.map.setView(estado.centroAnterior, estado.zoomAnterior, { animate: false });
        }
        if (estado.focoAnterior?.isConnected) estado.focoAnterior.focus({ preventScroll: true });
    }
});
document.addEventListener("plamont:auth-alterado", () => {
    if (!window.Auth?.pode?.("editar")) Mapa.cancelarSelecaoLocalizacao();
});
