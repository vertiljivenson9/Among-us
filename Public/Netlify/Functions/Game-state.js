const { v4: uuidv4 } = require('uuid');

// Estado global en memoria (en producción usar base de datos)
let gameStates = {};

exports.handler = async function(event, context) {
    // Manejar CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Método no permitido' };
    }

    try {
        const { action, groupId, playerName, playerId, parameter } = JSON.parse(event.body);
        
        // Inicializar estado del grupo si no existe
        if (!gameStates[groupId]) {
            gameStates[groupId] = crearEstadoInicial();
        }

        const state = gameStates[groupId];

        switch(action) {
            case 'get_state':
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(state)
                };

            case 'register':
                return await registrarJugador(state, playerName, groupId);

            case 'mover':
                return await moverJugador(state, playerId, parameter);

            case 'matar':
                return await matarJugador(state, playerId);

            case 'sabotear':
                return await sabotear(state, playerId, parameter);

            case 'reportar':
                return await reportarEmergencia(state, playerId);

            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Acción no válida' })
                };
        }
    } catch (error) {
        console.error('Error en game-state:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error interno del servidor' })
        };
    }
};

function crearEstadoInicial() {
    return {
        jugadores: {},
        mapa: {
            exterior: { tipo: 'exterior', jugadores: [] },
            casa1: { tipo: 'interior', jugadores: [] },
            casa2: { tipo: 'interior', jugadores: [] },
            garaje: { tipo: 'interior', jugadores: [] }
        },
        estado: 'activo',
        impostores: [],
        tareas: {},
        emergencias: [],
        ultimaActualizacion: new Date().toISOString()
    };
}

function registrarJugador(state, playerName, groupId) {
    const playerId = uuidv4();
    
    // Determinar rol (20% de chance de ser impostor)
    const totalJugadores = Object.keys(state.jugadores).length;
    const esImpostor = totalJugadores < 5 && Math.random() < 0.2;
    
    const nuevoJugador = {
        id: playerId,
        nombre: playerName,
        rol: esImpostor ? 'impostor' : 'tripulante',
        vivo: true,
        ubicacion: 'exterior',
        tareasCompletadas: 0
    };

    state.jugadores[playerId] = nuevoJugador;
    state.mapa.exterior.jugadores.push(playerId);

    if (esImpostor) {
        state.impostores.push(playerId);
    }

    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
            success: true,
            jugador: nuevoJugador,
            mensaje: `Bienvenido ${playerName}! Eres ${esImpostor ? 'IMPOSTOR 👿' : 'TRIPULANTE 👨‍🚀'}`
        })
    };
}

function moverJugador(state, playerId, nuevaZona) {
    const jugador = state.jugadores[playerId];
    if (!jugador || !jugador.vivo) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Jugador no válido' })
        };
    }

    // Remover de zona actual
    const zonaActual = state.mapa[jugador.ubicacion];
    if (zonaActual) {
        zonaActual.jugadores = zonaActual.jugadores.filter(id => id !== playerId);
    }

    // Agregar a nueva zona
    jugador.ubicacion = nuevaZona;
    state.mapa[nuevaZona].jugadores.push(playerId);

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
            success: true,
            nuevaUbicacion: nuevaZona,
            jugadoresEnZona: state.mapa[nuevaZona].jugadores.map(id => state.jugadores[id].nombre)
        })
    };
}

function matarJugador(state, playerId) {
    const impostor = state.jugadores[playerId];
    
    if (!impostor || impostor.rol !== 'impostor' || !impostor.vivo) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'No puedes matar' })
        };
    }

    const ubicacion = state.mapa[impostor.ubicacion];
    const posiblesVictimas = ubicacion.jugadores
        .filter(id => id !== playerId && state.jugadores[id].vivo && state.jugadores[id].rol === 'tripulante');

    if (posiblesVictimas.length === 0) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'No hay víctimas disponibles' })
        };
    }

    const victimaId = posiblesVictimas[0];
    const victima = state.jugadores[victimaId];
    victima.vivo = false;

    // Remover víctima del mapa
    state.mapa[impostor.ubicacion].jugadores = state.mapa[impostor.ubicacion].jugadores.filter(id => id !== victimaId);

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
            success: true,
            victima: victima.nombre,
            mensajeGlobal: `💀 ${victima.nombre} fue encontrado sin vida en ${impostor.ubicacion}`
        })
    };
}

function sabotear(state, playerId, tipoSabotaje) {
    const impostor = state.jugadores[playerId];
    
    if (!impostor || impostor.rol !== 'impostor') {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Solo los impostores pueden sabotear' })
        };
    }

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
            success: true,
            mensajeGlobal: `⚡ ¡SABOTAJE! Los tripulantes tienen 5 minutos para resolverlo`
        })
    };
}

function reportarEmergencia(state, playerId) {
    const jugador = state.jugadores[playerId];
    
    if (!jugador || !jugador.vivo) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Jugador no válido' })
        };
    }

    state.emergencias.push({
        jugadorId: playerId,
        ubicacion: jugador.ubicacion,
        timestamp: new Date().toISOString()
    });

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
            success: true,
            mensajeGlobal: `🚨 ${jugador.nombre} reportó una emergencia en ${jugador.ubicacion}`
        })
    };
}
