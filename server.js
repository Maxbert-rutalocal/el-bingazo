const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir la carpeta pública
app.use(express.static(path.join(__dirname, 'public')));

// Cargar la base de datos de cartones en memoria
let bangueraCartones = [];
try {
    const data = fs.readFileSync(path.join(__dirname, 'public', 'cartones.json'), 'utf8');
    bangueraCartones = JSON.parse(data);
    console.log(`✅ Base de datos cargada exitosamente: ${bangueraCartones.length} cartones listos.`);
} catch (err) {
    console.error("❌ ERROR CRÍTICO: No se pudo leer 'cartones.json' en la carpeta public/.", err);
}

// Historial del estado del juego
let estadoJuego = {
    bolasSacadas: [], // Aquí guardamos las balotas que vas cantando (ej: [15, 42, 75])
    titulo: "EL BINGAZO LIVE"
};

// Conexión de usuarios y mesa de control
wss.on('connection', (ws) => {
    console.log('🔌 Nuevo dispositivo conectado al sistema');

    // Al conectarse, enviamos inmediatamente las bolas que ya salieron para que se sincronice
    ws.send(JSON.stringify({ type: 'ESTADO_INICIAL', data: estadoJuego }));

    ws.on('message', (message) => {
        try {
            const evento = JSON.parse(message);

            switch (evento.type) {
                case 'SOLICITAR_CARTON':
                    // Buscamos el cartón ignorando mayúsculas/minúsculas
                    const cartonEncontrado = bangueraCartones.find(
                        c => String(c.id).toUpperCase() === String(evento.id).toUpperCase()
                    );
                    
                    if (cartonEncontrado) {
                        ws.send(JSON.stringify({ type: 'ENTREGAR_CARTON', carton: cartonEncontrado }));
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR_CARTON', mensaje: `El cartón "${evento.id}" no existe.` }));
                    }
                    break;

                case 'BOLA_SACADA':
                    // Registramos la bola en el servidor si no estaba
                    if (!estadoJuego.bolasSacadas.includes(evento.bola)) {
                        estadoJuego.bolasSacadas.push(evento.bola);
                    }
                    // Le avisamos a todos los celulares conectados
                    broadcast({ type: 'NUEVA_BOLA', bola: evento.bola, letra: evento.letra });
                    break;

                case 'BARRIDO':
                    // Reiniciar partida
                    estadoJuego.bolasSacadas = [];
                    broadcast({ type: 'REINICIAR_JUEGO' });
                    break;

                case 'CAMBIAR_TITULO':
                    estadoJuego.titulo = evento.titulo;
                    broadcast({ type: 'NUEVA_BOLA', actualizarTitulo: true, titulo: evento.titulo });
                    break;
            }
        } catch (e) {
            console.error("Error procesando mensaje socket:", e);
        }
    });
});

// Función para enviar datos a todos los clientes conectados simultáneamente
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 ¡EL BINGAZO CORRIENDO EN TIEMPO REAL!`);
    console.log(`👉 Mesa de Control: http://localhost:${PORT}/index.html`);
    console.log(`👉 Teléfonos de Jugadores: http://localhost:${PORT}/jugador.html`);
    console.log(`====================================================`);
});