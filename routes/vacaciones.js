const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Solicitar vacaciones (ruta principal)
router.post('/', authenticateToken, (req, res) => {
    const { fecha_inicio, fecha_fin, motivo, dias_solicitados } = req.body;
    const empleadoId = req.user.id;

    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de inicio y fin son requeridas'
        });
    }

    // Validar fechas
    const inicio = moment(fecha_inicio);
    const fin = moment(fecha_fin);

    if (!inicio.isValid() || !fin.isValid()) {
        return res.status(400).json({
            success: false,
            message: 'Fechas inválidas'
        });
    }

    if (inicio.isBefore(moment(), 'day')) {
        return res.status(400).json({
            success: false,
            message: 'La fecha de inicio no puede ser anterior a hoy'
        });
    }

    if (fin.isBefore(inicio)) {
        return res.status(400).json({
            success: false,
            message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
    }

    const diasCalculados = fin.diff(inicio, 'days') + 1;

    const db = new sqlite3.Database(dbPath);

    db.run(
        'INSERT INTO vacaciones (empleado_id, fecha_inicio, fecha_fin, dias_solicitados, motivo, estado) VALUES (?, ?, ?, ?, ?, ?)',
        [empleadoId, fecha_inicio, fecha_fin, dias_solicitados || diasCalculados, motivo, 'pendiente'],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al solicitar vacaciones'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Solicitud de vacaciones enviada exitosamente',
                data: {
                    id: this.lastID,
                    fecha_inicio,
                    fecha_fin,
                    dias_solicitados: dias_solicitados || diasCalculados,
                    estado: 'pendiente'
                }
            });
        }
    );
});

// Obtener mis vacaciones
router.get('/mis-vacaciones', authenticateToken, (req, res) => {
    const empleadoId = req.user.id;
    const db = new sqlite3.Database(dbPath);

    db.all(
        'SELECT * FROM vacaciones WHERE empleado_id = ? ORDER BY fecha_inicio DESC',
        [empleadoId],
        (err, vacaciones) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener vacaciones'
                });
            }

            res.json({
                success: true,
                data: vacaciones
            });
        }
    );
});

// Solicitar vacaciones (ruta alternativa)
router.post('/solicitar', authenticateToken, (req, res) => {
    const { fecha_inicio, fecha_fin, motivo } = req.body;
    const empleadoId = req.user.id;

    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de inicio y fin son requeridas'
        });
    }

    // Validar fechas
    const inicio = moment(fecha_inicio);
    const fin = moment(fecha_fin);

    if (!inicio.isValid() || !fin.isValid()) {
        return res.status(400).json({
            success: false,
            message: 'Fechas inválidas'
        });
    }

    if (inicio.isBefore(moment(), 'day')) {
        return res.status(400).json({
            success: false,
            message: 'La fecha de inicio no puede ser anterior a hoy'
        });
    }

    if (fin.isBefore(inicio)) {
        return res.status(400).json({
            success: false,
            message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
    }

    const diasSolicitados = fin.diff(inicio, 'days') + 1;

    const db = new sqlite3.Database(dbPath);

    // Verificar si hay vacaciones aprobadas en esas fechas
    db.get(
        `SELECT * FROM vacaciones 
         WHERE empleado_id = ? AND estado = 'aprobado' 
         AND ((fecha_inicio BETWEEN ? AND ?) OR (fecha_fin BETWEEN ? AND ?) 
         OR (fecha_inicio <= ? AND fecha_fin >= ?))`,
        [empleadoId, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin],
        (err, conflicto) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar conflictos de fechas'
                });
            }

            if (conflicto) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Ya tienes vacaciones aprobadas en esas fechas'
                });
            }

            // Crear solicitud de vacaciones
            db.run(
                'INSERT INTO vacaciones (empleado_id, fecha_inicio, fecha_fin, dias_solicitados, motivo) VALUES (?, ?, ?, ?, ?)',
                [empleadoId, fecha_inicio, fecha_fin, diasSolicitados, motivo],
                function(err) {
                    if (err) {
                        db.close();
                        return res.status(500).json({
                            success: false,
                            message: 'Error al crear solicitud de vacaciones'
                        });
                    }

                    // Crear notificación para administradores
                    db.run(
                        `INSERT INTO notificaciones (empleado_id, titulo, mensaje, tipo)
                         SELECT id, 'Nueva solicitud de vacaciones', 
                         'El empleado ${req.user.nombre} ${req.user.apellido} ha solicitado ${diasSolicitados} días de vacaciones', 'info'
                         FROM empleados WHERE permisos = 'admin'`,
                        (err) => {
                            db.close();
                            
                            if (err) {
                                console.error('Error al crear notificación:', err);
                            }

                            res.status(201).json({
                                success: true,
                                message: 'Solicitud de vacaciones enviada exitosamente',
                                data: {
                                    id: this.lastID,
                                    dias_solicitados: diasSolicitados,
                                    estado: 'pendiente'
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Obtener mis vacaciones
router.get('/mis-vacaciones', authenticateToken, (req, res) => {
    const { estado, limite = 50 } = req.query;
    const empleadoId = req.user.id;

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT v.*, e_aprobador.nombre as aprobador_nombre, e_aprobador.apellido as aprobador_apellido
        FROM vacaciones v
        LEFT JOIN empleados e_aprobador ON v.aprobado_por = e_aprobador.id
        WHERE v.empleado_id = ?
    `;
    let params = [empleadoId];

    if (estado) {
        query += ' AND v.estado = ?';
        params.push(estado);
    }

    query += ' ORDER BY v.fecha_inicio DESC LIMIT ?';
    params.push(parseInt(limite));

    db.all(query, params, (err, vacaciones) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener vacaciones'
            });
        }

        res.json({
            success: true,
            data: vacaciones
        });
    });
});

// Obtener todas las vacaciones (solo admin)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const { estado, empleado_id, limite = 50 } = req.query;

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT v.*, e.nombre, e.apellido, e.email, e_aprobador.nombre as aprobador_nombre, e_aprobador.apellido as aprobador_apellido
        FROM vacaciones v
        INNER JOIN empleados e ON v.empleado_id = e.id
        LEFT JOIN empleados e_aprobador ON v.aprobado_por = e_aprobador.id
        WHERE 1=1
    `;
    let params = [];

    if (estado) {
        query += ' AND v.estado = ?';
        params.push(estado);
    }

    if (empleado_id) {
        query += ' AND v.empleado_id = ?';
        params.push(empleado_id);
    }

    query += ' ORDER BY v.fecha_inicio DESC LIMIT ?';
    params.push(parseInt(limite));

    db.all(query, params, (err, vacaciones) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener vacaciones'
            });
        }

        res.json({
            success: true,
            data: vacaciones
        });
    });
});

// Aprobar/Rechazar vacaciones (solo admin)
router.put('/:id/estado', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    if (!estado || !['aprobado', 'rechazado'].includes(estado)) {
        return res.status(400).json({
            success: false,
            message: 'Estado debe ser "aprobado" o "rechazado"'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Verificar que la solicitud existe
    db.get(
        'SELECT * FROM vacaciones WHERE id = ?',
        [id],
        (err, vacacion) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar solicitud'
                });
            }

            if (!vacacion) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Solicitud de vacaciones no encontrada'
                });
            }

            if (vacacion.estado !== 'pendiente') {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Esta solicitud ya ha sido procesada'
                });
            }

            // Actualizar estado
            const fechaAprobacion = moment().format('YYYY-MM-DD HH:mm:ss');
            
            db.run(
                'UPDATE vacaciones SET estado = ?, observaciones = ?, aprobado_por = ?, fecha_aprobacion = ? WHERE id = ?',
                [estado, observaciones, req.user.id, fechaAprobacion, id],
                function(err) {
                    if (err) {
                        db.close();
                        return res.status(500).json({
                            success: false,
                            message: 'Error al actualizar estado'
                        });
                    }

                    // Crear notificación para el empleado
                    const mensaje = estado === 'aprobado' 
                        ? `Tu solicitud de vacaciones del ${moment(vacacion.fecha_inicio).format('DD/MM/YYYY')} al ${moment(vacacion.fecha_fin).format('DD/MM/YYYY')} ha sido aprobada`
                        : `Tu solicitud de vacaciones del ${moment(vacacion.fecha_inicio).format('DD/MM/YYYY')} al ${moment(vacacion.fecha_fin).format('DD/MM/YYYY')} ha sido rechazada`;

                    db.run(
                        'INSERT INTO notificaciones (empleado_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)',
                        [vacacion.empleado_id, `Vacaciones ${estado === 'aprobado' ? 'Aprobadas' : 'Rechazadas'}`, mensaje, estado === 'aprobado' ? 'success' : 'warning'],
                        (err) => {
                            db.close();
                            
                            if (err) {
                                console.error('Error al crear notificación:', err);
                            }

                            res.json({
                                success: true,
                                message: `Vacaciones ${estado === 'aprobado' ? 'aprobadas' : 'rechazadas'} exitosamente`
                            });
                        }
                    );
                }
            );
        }
    );
});

// Cancelar vacaciones (solo el empleado propietario)
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const empleadoId = req.user.id;
    const db = new sqlite3.Database(dbPath);

    // Verificar que la solicitud existe y pertenece al empleado
    db.get(
        'SELECT * FROM vacaciones WHERE id = ? AND empleado_id = ?',
        [id, empleadoId],
        (err, vacacion) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar solicitud'
                });
            }

            if (!vacacion) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Solicitud de vacaciones no encontrada'
                });
            }

            if (vacacion.estado !== 'pendiente') {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Solo se pueden cancelar solicitudes pendientes'
                });
            }

            // Eliminar la solicitud
            db.run(
                'DELETE FROM vacaciones WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al cancelar solicitud'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Solicitud de vacaciones cancelada exitosamente'
                    });
                }
            );
        }
    );
});

module.exports = router;
