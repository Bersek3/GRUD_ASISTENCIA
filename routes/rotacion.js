const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Configuración de horarios base (distribución específica por roles)
const HORARIOS_BASE = {
    CENTRALISTA_MANANA: {
        nombre: 'Centralista Turno Mañana',
        entrada: '08:00',
        salida: '16:00',
        dias: [1, 2, 3, 4, 5, 6, 7],
        descripcion: 'Centralista turno mañana todos los días',
        rol_requerido: 'Centralista'
    },
    CENTRALISTA_TARDE: {
        nombre: 'Centralista Turno Tarde',
        entrada: '16:00',
        salida: '00:00',
        dias: [1, 2, 3, 4, 5, 6, 7],
        descripcion: 'Centralista turno tarde todos los días',
        rol_requerido: 'Centralista'
    },
    DESPACHADOR_MANANA: {
        nombre: 'Despachador Turno Mañana',
        entrada: '08:00',
        salida: '16:00',
        dias: [1, 2, 3, 4, 5, 6, 7],
        descripcion: 'Despachador turno mañana todos los días',
        rol_requerido: 'Despachador'
    },
    DESPACHADOR_TARDE: {
        nombre: 'Despachador Turno Tarde',
        entrada: '16:00',
        salida: '00:00',
        dias: [1, 2, 3, 4, 5, 6, 7],
        descripcion: 'Despachador turno tarde todos los días',
        rol_requerido: 'Despachador'
    },
    TURNO_NOCHE: {
        nombre: 'Turno Noche',
        entrada: '00:00',
        salida: '08:00',
        dias: [1, 2, 3, 4, 5, 6, 7],
        descripcion: 'Turno noche todos los días',
        rol_requerido: 'Turno Noche'
    }
};

// Función para obtener número de semana
function getCurrentWeek() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek);
}

// Función para crear horarios base
async function createBaseSchedules(db) {
    // Primero, limpiar horarios duplicados
    await new Promise((resolve, reject) => {
        db.run(`
            DELETE FROM horarios 
            WHERE nombre IN (
                'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                'Fin de Semana Mañana', 'Fin de Semana Tarde',
                'Centralista Turno Mañana', 'Centralista Turno Tarde',
                'Despachador Turno Mañana', 'Despachador Turno Tarde'
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    
    // Crear horarios únicos
    for (const [key, horario] of Object.entries(HORARIOS_BASE)) {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO horarios 
                 (nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    horario.nombre,
                    horario.entrada,
                    horario.salida,
                    horario.dias.join(','),
                    horario.descripcion,
                    1
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

// Función para distribuir empleados específicamente por roles
function distributeEmployeesEquitably(empleados, horarios) {
    const distribution = [];
    const currentWeek = getCurrentWeek();
    
    console.log(`📊 Distribuyendo ${empleados.length} empleados en ${horarios.length} horarios específicos por rol`);
    
    // Separar empleados por rol
    const centralistas = empleados.filter(emp => emp.rol === 'Centralista');
    const despachadores = empleados.filter(emp => emp.rol === 'Despachador');
    const turnoNoche = empleados.filter(emp => emp.rol === 'Turno Noche');
    
    console.log(`👥 Centralistas disponibles: ${centralistas.length}`);
    console.log(`👥 Despachadores disponibles: ${despachadores.length}`);
    console.log(`👥 Turno Noche disponibles: ${turnoNoche.length}`);
    
    // Mapear horarios con sus roles requeridos
    const horariosConRoles = horarios.map(horario => {
        let rolRequerido = null;
        
        if (horario.nombre.includes('Centralista')) {
            rolRequerido = 'Centralista';
        } else if (horario.nombre.includes('Despachador')) {
            rolRequerido = 'Despachador';
        } else if (horario.nombre.includes('Turno Noche')) {
            rolRequerido = 'Turno Noche';
        }
        
        return {
            ...horario,
            rol_requerido: rolRequerido
        };
    });
    
    // Distribuir según el rol requerido por cada horario
    horariosConRoles.forEach((horario, index) => {
        let empleadosElegibles = [];
        let empleadoSeleccionado = null;
        
        // Determinar qué empleados pueden ocupar este horario
        if (horario.rol_requerido === 'Centralista') {
            empleadosElegibles = centralistas;
        } else if (horario.rol_requerido === 'Despachador') {
            empleadosElegibles = despachadores;
        } else if (horario.rol_requerido === 'Turno Noche') {
            empleadosElegibles = turnoNoche;
        }
        
        if (empleadosElegibles.length > 0) {
            // Rotar empleados basado en la semana actual
            const empleadoIndex = (currentWeek + index) % empleadosElegibles.length;
            empleadoSeleccionado = empleadosElegibles[empleadoIndex];
        }
        
        distribution.push({
            horario: horario,
            empleados: empleadoSeleccionado ? [empleadoSeleccionado] : []
        });
        
        if (empleadoSeleccionado) {
            console.log(`✅ ${empleadoSeleccionado.nombre} ${empleadoSeleccionado.apellido} (${empleadoSeleccionado.rol}) -> ${horario.nombre}`);
        } else {
            console.log(`⚠️  No hay empleados disponibles para ${horario.nombre} (requiere: ${horario.rol_requerido || 'cualquier rol'})`);
        }
    });
    
    return distribution;
}

// Ejecutar rotación inteligente
router.post('/ejecutar', authenticateToken, requireAdmin, async (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    try {
        console.log('🔄 Ejecutando rotación inteligente...');
        
        // 1. Crear horarios base
        await createBaseSchedules(db);
        
        // 2. Obtener empleados activos
        const empleados = await new Promise((resolve, reject) => {
            db.all(`
                SELECT e.id, e.nombre, e.apellido, r.nombre as rol
                FROM empleados e
                LEFT JOIN roles r ON e.rol_id = r.id
                WHERE e.activo = 1 AND e.email != 'admin@sistema.com'
                ORDER BY e.id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (empleados.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay empleados activos para asignar horarios'
            });
        }
        
        // 3. Obtener horarios base
        const horarios = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, nombre, hora_entrada, hora_salida, dias_semana
                FROM horarios
                WHERE activo = 1 AND nombre IN (
                    'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                    'Fin de Semana Mañana', 'Fin de Semana Tarde'
                )
                ORDER BY id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // 4. Desactivar horarios actuales
        await new Promise((resolve, reject) => {
            db.run('UPDATE empleado_horarios SET activo = 0', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // 5. Distribuir empleados equitativamente
        const distribution = distributeEmployeesEquitably(empleados, horarios);
        
        // 6. Asignar horarios
        const fechaInicio = new Date().toISOString().split('T')[0];
        let totalAsignaciones = 0;
        
        for (const item of distribution) {
            for (const empleado of item.empleados) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO empleado_horarios 
                         (empleado_id, horario_id, fecha_inicio, activo) 
                         VALUES (?, ?, ?, ?)`,
                        [empleado.id, item.horario.id, fechaInicio, 1],
                        (err) => {
                            if (err) reject(err);
                            else {
                                totalAsignaciones++;
                                resolve();
                            }
                        }
                    );
                });
            }
        }
        
        res.json({
            success: true,
            message: `Rotación completada: ${totalAsignaciones} asignaciones realizadas`,
            data: {
                totalAsignaciones,
                empleados: empleados.length,
                horarios: horarios.length,
                distribution: distribution.map(item => ({
                    horario: item.horario.nombre,
                    empleados: item.empleados.length
                }))
            }
        });
        
    } catch (error) {
        console.error('Error en rotación inteligente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al ejecutar la rotación'
        });
    } finally {
        db.close();
    }
});

// Vista previa de rotación
router.get('/preview', authenticateToken, requireAdmin, async (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Obtener empleados activos
        const empleados = await new Promise((resolve, reject) => {
            db.all(`
                SELECT e.id, e.nombre, e.apellido, r.nombre as rol
                FROM empleados e
                LEFT JOIN roles r ON e.rol_id = r.id
                WHERE e.activo = 1 AND e.email != 'admin@sistema.com'
                ORDER BY e.id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Obtener horarios base
        const horarios = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, nombre, hora_entrada, hora_salida, dias_semana
                FROM horarios
                WHERE activo = 1 AND nombre IN (
                    'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                    'Fin de Semana Mañana', 'Fin de Semana Tarde'
                )
                ORDER BY id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Generar distribución
        const distribution = distributeEmployeesEquitably(empleados, horarios);
        
        res.json({
            success: true,
            preview: distribution.map(item => ({
                horario: item.horario.nombre,
                empleados: item.empleados.map(emp => ({
                    nombre: emp.nombre,
                    apellido: emp.apellido,
                    rol: emp.rol
                }))
            }))
        });
        
    } catch (error) {
        console.error('Error generando vista previa:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar vista previa'
        });
    } finally {
        db.close();
    }
});

// Resetear todos los horarios
router.post('/reset', authenticateToken, requireAdmin, async (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Desactivar todos los horarios de empleados
        await new Promise((resolve, reject) => {
            db.run('UPDATE empleado_horarios SET activo = 0', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({
            success: true,
            message: 'Todos los horarios han sido reseteados'
        });
        
    } catch (error) {
        console.error('Error reseteando horarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al resetear horarios'
        });
    } finally {
        db.close();
    }
});

// Obtener estadísticas de rotación
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Contar empleados activos
        const empleadosCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count
                FROM empleados e
                WHERE e.activo = 1 AND e.email != 'admin@sistema.com'
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        // Contar horarios base
        const horariosCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count
                FROM horarios
                WHERE activo = 1 AND nombre IN (
                    'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                    'Fin de Semana Mañana', 'Fin de Semana Tarde'
                )
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        // Contar asignaciones activas
        const asignacionesCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count
                FROM empleado_horarios
                WHERE activo = 1
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        res.json({
            success: true,
            data: {
                empleadosActivos: empleadosCount,
                horariosDisponibles: horariosCount,
                asignacionesActivas: asignacionesCount,
                semanaActual: getCurrentWeek(),
                promedioPorHorario: horariosCount > 0 ? (empleadosCount / horariosCount).toFixed(1) : 0
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    } finally {
        db.close();
    }
});

module.exports = router;
