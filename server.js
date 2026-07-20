const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- SOLUCIÓN AL PROBLEMA WINDOWS VS LINUX ---
let dataDir = path.join(__dirname, 'data');
if (fs.existsSync(path.join(__dirname, 'Data'))) {
    dataDir = path.join(__dirname, 'Data');
} else if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const gestionPath = path.join(dataDir, 'gestion.json');
if (!fs.existsSync(gestionPath)) fs.writeFileSync(gestionPath, '[]');

let cartonesPath = path.join(dataDir, 'cartones.json');
if (!fs.existsSync(cartonesPath) && fs.existsSync(path.join(dataDir, 'Cartones.json'))) {
    cartonesPath = path.join(dataDir, 'Cartones.json');
}
if (!fs.existsSync(cartonesPath)) fs.writeFileSync(cartonesPath, '[]');

function getGestion() { try { return JSON.parse(fs.readFileSync(gestionPath, 'utf-8')); } catch (e) { return []; } }
function saveGestion(data) { fs.writeFileSync(gestionPath, JSON.stringify(data, null, 2)); }

let cartonesGlobal = [];
try {
    cartonesGlobal = JSON.parse(fs.readFileSync(cartonesPath, 'utf-8'));
    console.log(`✅ ¡Éxito! Se cargaron ${cartonesGlobal.length} cartones.`);
} catch (e) {
    console.error("❌ Error al cargar cartones:", e);
}

let bolasSacadasGlobal = [];

io.on('connection', (socket) => {
    socket.emit('ESTADO_INICIAL', { data: { bolasSacadas: bolasSacadasGlobal } });
    socket.emit('GESTION_NUEVO_REGISTRO', getGestion()); 

    socket.on('ADMIN_SACAR_BOLA', (data) => {
        bolasSacadasGlobal.push(data.bola);
        io.emit('NUEVA_BOLA', data);
    });

    socket.on('ADMIN_REINICIAR_JUEGO', () => {
        bolasSacadasGlobal = [];
        io.emit('REINICIAR_JUEGO');
    });

    socket.on('ADMIN_DECLARAR_GANADOR', (data) => {
        io.emit('GESTION_REGISTRAR_GANADOR_AUTO', data);
    });

    socket.on('ADMIN_RESET_VENTAS', () => {
        saveGestion([]); 
        io.emit('GESTION_NUEVO_REGISTRO', []); 
        io.emit('RESETEO_GLOBAL_VENTAS'); 
    });

    socket.on('JUGADOR_REGISTRARSE', (data) => {
        const gestion = getGestion();
        const existe = gestion.find(g => g.cartones.includes(data.cartonId));
        if (!existe) {
            gestion.push({ nombre: data.nombre, tel: data.tel, cartones: [data.cartonId], pagado: false });
            saveGestion(gestion);
        }
        io.emit('GESTION_NUEVO_REGISTRO', getGestion()); 
    });

    // --- MEJORA: AHORA REVISA SI ESTÁ PAGADO AL BUSCAR EL CARTÓN ---
    socket.on('SOLICITAR_CARTON', (data) => {
        const idBuscado = String(data.id).toUpperCase();
        const carton = cartonesGlobal.find(c => String(c.id).toUpperCase() === idBuscado);
        
        if (carton) {
            const gestion = getGestion();
            const registro = gestion.find(g => g.cartones.some(cId => String(cId).toUpperCase() === idBuscado));
            const estaPagado = registro ? registro.pagado : false;

            socket.emit('ENTREGAR_CARTON', { carton, pagado: estaPagado });
        } else {
            socket.emit('ERROR_CARTON', { mensaje: 'Cartón no encontrado.' });
        }
    });

    socket.on('JUGADOR_PAUSA', (data) => io.emit('ADMIN_ALERTA_PAUSA', data));
    socket.on('JUGADOR_BINGO', (data) => io.emit('ADMIN_ALERTA_BINGO', data));

    // --- MEJORA: COMPARA TEXTOS EXACTOS ---
    socket.on('GESTION_TOGGLE_PAGO', (data) => {
        const gestion = getGestion();
        const targetId = String(data.cartonId).toUpperCase();
        const registro = gestion.find(g => g.cartones.some(c => String(c).toUpperCase() === targetId));
        
        if (registro) {
            registro.pagado = data.pagado;
            saveGestion(gestion);
            io.emit('CARTON_ACTIVADO', { cartonId: targetId, pagado: data.pagado });
            io.emit('GESTION_NUEVO_REGISTRO', gestion); 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));