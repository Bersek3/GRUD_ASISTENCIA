const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Registrar entrada
router.post('/entrada', authenticateToken, (req, res) => {
    const { observaciones, ubicacion } = req.body;
    const empleadoId = req.user.id;
    const fecha = moment().format('YYYY-MM-DD');
    const horaEntrada = moment().format('HH:mm:ss');
    const ipAddress = req.ip || req.connection.remoteAddress;

    const db = new sqlite3.Database(dbPath);

    // Verificar si ya existe un registro de entrada para hoy
    db.get(
        'SELECT * FROM asistencia WHERE empleado_id = ? AND fecha = ?',
        [empleadoId, fecha],
        (err, registroExistente) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar registro de asistencia'
                });
            }

            if (registroExistente) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Ya has registrado tu entrada hoy'
                });
            }

            // Crear nuevo registro de entrada
            db.run(
                'INSERT INTO asistencia (empleado_id, fecha, hora_entrada, estado, observaciones, ip_address, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [empleadoId, fecha, horaEntrada, 'presente', observaciones, ipAddress, ubicacion],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al registrar entrada'
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: 'Entrada registrada exitosamente',
                        data: {
                            id: this.lastID,
                            fecha,
                            hora_entrada: horaEntrada,
                            estado: 'presente'
                        }
                    });
                }
            );
        }
    );
});

// Registrar salida
router.post('/salida', authenticateToken, (req, res) => {
    const { observaciones } = req.body;
    const empleadoId = req.user.id;
    const fecha = moment().format('YYYY-MM-DD');
    const horaSalida = moment().format('HH:mm:ss');

    const db = new sqlite3.Database(dbPath);

    // Buscar registro de entrada de hoy
    db.get(
        'SELECT * FROM asistencia WHERE empleado_id = ? AND fecha = ?',
        [empleadoId, fecha],
        (err, registro) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al buscar registro de asistencia'
                });
            }

            if (!registro) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'No tienes un registro de entrada para hoy'
                });
            }

            if (registro.hora_salida) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Ya has registrado tu salida hoy'
                });
            }

            // Calcular horas trabajadas
            const entrada = moment(`${fecha} ${registro.hora_entrada}`);
            const salida = moment(`${fecha} ${horaSalida}`);
            const horasTrabajadas = salida.diff(entrada, 'hours', true);

            // Actualizar registro con salida
            db.run(
                'UPDATE asistencia SET hora_salida = ?, horas_trabajadas = ?, observaciones = ? WHERE id = ?',
                [horaSalida, horasTrabajadas, observaciones, registro.id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al registrar salida'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Salida registrada exitosamente',
                        data: {
                            fecha,
                            hora_entrada: registro.hora_entrada,
                            hora_salida: horaSalida,
                            horas_trabajadas: horasTrabajadas
                        }
                    });
                }
            );
        }
    );
});

// Obtener asistencia del empleado actual
router.get('/mi-asistencia', authenticateToken, (req, res) => {
    const { fecha_inicio, fecha_fin, limite = 30 } = req.query;
    const empleadoId = req.user.id;
    
    let fechaInicio = fecha_inicio || moment().subtract(limite, 'days').format('YYYY-MM-DD');
    let fechaFin = fecha_fin || moment().format('YYYY-MM-DD');

    const db = new sqlite3.Database(dbPath);

    db.all(
        `SELECT * FROM asistencia 
         WHERE empleado_id = ? AND fecha BETWEEN ? AND ?
         ORDER BY fecha DESC`,
        [empleadoId, fechaInicio, fechaFin],
        (err, asistencias) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener asistencia'
                });
            }

            // Calcular estadísticas
            const estadisticas = calcularEstadisticasAsistencia(asistencias);

            res.json({
                success: true,
                data: asistencias,
                estadisticas
            });
        }
    );
});

// Obtener asistencia de todos los empleados (solo admin)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const { fecha_inicio, fecha_fin, empleado_id, limite = 30 } = req.query;
    
    let fechaInicio = fecha_inicio || moment().subtract(limite, 'days').format('YYYY-MM-DD');
    let fechaFin = fecha_fin || moment().format('YYYY-MM-DD');

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT a.*, e.nombre, e.apellido, e.email, r.nombre as rol_nombre
        FROM asistencia a
        INNER JOIN empleados e ON a.empleado_id = e.id
        LEFT JOIN roles r ON e.rol_id = r.id
        WHERE a.fecha BETWEEN ? AND ?
    `;
    let params = [fechaInicio, fechaFin];

    if (empleado_id) {
        query += ' AND a.empleado_id = ?';
        params.push(empleado_id);
    }

    query += ' ORDER BY a.fecha DESC, a.hora_entrada DESC';

    db.all(query, params, (err, asistencias) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener asistencias'
            });
        }

        res.json({
            success: true,
            data: asistencias
        });
    });
});

// Función auxiliar para calcular estadísticas de asistencia
function calcularEstadisticasAsistencia(asistencias) {
    const totalDias = asistencias.length;
    const diasPresentes = asistencias.filter(a => a.estado === 'presente').length;
    const diasAusentes = asistencias.filter(a => a.estado === 'ausente').length;
    const totalHoras = asistencias.reduce((sum, a) => sum + (a.horas_trabajadas || 0), 0);
    const promedioHoras = totalDias > 0 ? totalHoras / diasPresentes : 0;

    return {
        totalDias,
        diasPresentes,
        diasAusentes,
        totalHoras: Math.round(totalHoras * 100) / 100,
        promedioHoras: Math.round(promedioHoras * 100) / 100,
        porcentajeAsistencia: totalDias > 0 ? Math.round((diasPresentes / totalDias) * 100) : 0
    };
}

module.exports = router;
