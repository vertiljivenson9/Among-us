class AmongUsGame {
    constructor() {
        this.jugador = null;
        this.partida = null;
        this.grupoId = this.obtenerGrupoId();
        this.socket = null;
        
        this.inicializarJuego();
    }

    obtenerGrupoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('grupo') || this.generarGrupoId();
    }

    generarGrupoId() {
        return 'grupo-' + Math.random().toString(36).substr(2, 9);
    }

    async inicializarJuego() {
        if (this.grupoId && !window.location.search.includes('grupo=')) {
            window.history.replaceState({}, '', `?grupo=${this.grupoId}`);
        }

        await this.cargarEstadoJuego();
        this.renderizarMapa();
        this.actualizarInterfaz();
    }

    async cargarEstadoJuego() {
        try {
            const response = await fetch('/.netlify/functions/game-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'get_state',
                    groupId: this.grupoId
                })
            });
            
            this.partida = await response.json();
        } catch (error) {
            console.error('Error cargando estado:', error);
            this.partida = this.estadoInicial();
        }
    }

    estadoInicial() {
        return {
            jugadores: {},
            mapa: {
                exterior: { tipo: 'exterior', jugadores: [] },
                casa1: { tipo: 'interior', jugadores: [] },
                casa2: { tipo: 'interior', jugadores: [] },
                garaje: { tipo: 'interior', jugadores: [] }
            },
            estado: 'esperando',
            impostores: [],
            tareas: {},
            emergencias: []
        };
    }

    renderizarMapa() {
        const mapa = document.getElementById('map');
        if (!mapa) return;

        mapa.innerHTML = `
            <div class="map-zone exterior" onclick="game.ejecutarAccion('mover', 'exterior')">
                🌳<br><small>Exterior</small>
            </div>
            <div class="map-zone interior" onclick="game.ejecutarAccion('mover', 'casa1')">
                🏠<br><small>Casa 1</small>
            </div>
            <div class="map-zone interior" onclick="game.ejecutarAccion('mover', 'casa2')">
                🏠<br><small>Casa 2</small>
            </div>
            <div class="map-zone interior" onclick="game.ejecutarAccion('mover', 'garaje')">
                🚗<br><small>Garaje</small>
            </div>
        `;
    }

    async registrarJugador(nombre) {
        if (!nombre.trim()) {
            alert('Por favor ingresa tu nombre');
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/game-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'register',
                    groupId: this.grupoId,
                    playerName: nombre.trim()
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.jugador = data.jugador;
                this.mostrarPantallaJuego();
                this.actualizarInterfaz();
                this.agregarLog(`👋 ${nombre} se unió al juego`);
            } else {
                alert('Error al registrar jugador: ' + data.error);
            }
        } catch (error) {
            console.error('Error registrando jugador:', error);
            alert('Error de conexión. Intenta nuevamente.');
        }
    }

    mostrarPantallaJuego() {
        document.getElementById('welcome-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
    }

    actualizarInterfaz() {
        if (!this.jugador) return;

        // Actualizar rol
        const roleElement = document.getElementById('player-role');
        roleElement.textContent = this.jugador.rol === 'impostor' ? '👿 IMPOSTOR' : '👨‍🚀 TRIPULANTE';
        roleElement.className = this.jugador.rol === 'impostor' ? 'impostor' : 'crewmate';

        // Mostrar/ocultar botones de impostor
        document.getElementById('kill-btn').classList.toggle('hidden', this.jugador.rol !== 'impostor');
        document.getElementById('sabotage-btn').classList.toggle('hidden', this.jugador.rol !== 'impostor');

        // Actualizar estado del juego
        document.getElementById('game-status').textContent = 
            `Jugadores: ${Object.keys(this.partida.jugadores).length} | Vivos: ${this.contarJugadoresVivos()}`;
    }

    contarJugadoresVivos() {
        return Object.values(this.partida.jugadores).filter(j => j.vivo).length;
    }

    async ejecutarAccion(accion, parametro = null) {
        if (!this.jugador) return;

        try {
            const response = await fetch('/.netlify/functions/game-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: accion,
                    groupId: this.grupoId,
                    playerId: this.jugador.id,
                    parameter: parametro
                })
            });

            const resultado = await response.json();
            
            if (resultado.success) {
                this.procesarResultadoAccion(accion, parametro, resultado);
                await this.cargarEstadoJuego();
                this.actualizarInterfaz();
            } else {
                this.agregarLog(`❌ ${resultado.error || 'Acción fallida'}`);
            }
        } catch (error) {
            console.error('Error ejecutando acción:', error);
            this.agregarLog('❌ Error de conexión');
        }
    }

    procesarResultadoAccion(accion, parametro, resultado) {
        switch(accion) {
            case 'mover':
                this.agregarLog(`🚶 Te moviste a ${parametro}`);
                break;
            case 'matar':
                this.agregarLog(`🔪 ¡Eliminaste a ${resultado.victima}!`);
                break;
            case 'sabotear':
                this.agregarLog(`⚡ Saboteaste ${parametro}`);
                break;
            case 'reportar':
                this.agregarLog(`🚨 Reportaste emergencia`);
                break;
        }

        if (resultado.mensajeGlobal) {
            this.agregarLog(resultado.mensajeGlobal, 'emergency');
        }
    }

    agregarLog(mensaje, tipo = 'normal') {
        const logContainer = document.getElementById('log-messages');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${tipo}`;
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// Funciones globales para HTML
let game;

function registrarJugador() {
    const nombre = document.getElementById('player-name').value;
    if (!game) {
        game = new AmongUsGame();
    }
    game.registrarJugador(nombre);
}

function ejecutarAccion(accion, parametro) {
    if (game) {
        game.ejecutarAccion(accion, parametro);
    }
}

// Inicializar juego cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    game = new AmongUsGame();
    
    // Mostrar enlace de invitación si hay grupo
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('grupo')) {
        const inviteLink = window.location.href;
        document.getElementById('invite-link').textContent = inviteLink;
        document.getElementById('game-link').classList.remove('hidden');
    }
});
