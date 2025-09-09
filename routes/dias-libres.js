const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Solicitar día libre
router.post('/solicitar', authenticateToken, (req, res) => {
    const { fecha, tipo, motivo } = req.body;
    const empleadoId = req.user.id;

    if (!fecha || !tipo) {
        return res.status(400).json({
            success: false,
            message: 'Fecha y tipo son requeridos'
        });
    }

    // Validar fecha
    const fechaSolicitada = moment(fecha);
    if (!fechaSolicitada.isValid()) {
        return res.status(400).json({
            success: false,
            message: 'Fecha inválida'
        });
    }

    if (fechaSolicitada.isBefore(moment(), 'day')) {
        return res.status(400).json({
            success: false,
            message: 'No puedes solicitar días libres para fechas pasadas'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Verificar si ya existe una solicitud para esa fecha
    db.get(
        'SELECT * FROM dias_libres WHERE empleado_id = ? AND fecha = ?',
        [empleadoId, fecha],
        (err, solicitudExistente) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar solicitud existente'
                });
            }

            if (solicitudExistente) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Ya tienes una solicitud para esta fecha'
                });
            }

            // Crear solicitud de día libre
            db.run(
                'INSERT INTO dias_libres (empleado_id, fecha, tipo, motivo) VALUES (?, ?, ?, ?)',
                [empleadoId, fecha, tipo, motivo],
                function(err) {
                    if (err) {
                        db.close();
                        return res.status(500).json({
                            success: false,
                            message: 'Error al crear solicitud de día libre'
                        });
                    }

                    // Crear notificación para administradores
                    db.run(
                        `INSERT INTO notificaciones (empleado_id, titulo, mensaje, tipo)
                         SELECT id, 'Nueva solicitud de día libre', 
                         'El empleado ${req.user.nombre} ${req.user.apellido} ha solicitado un día libre para ${moment(fecha).format('DD/MM/YYYY')}', 'info'
                         FROM empleados WHERE permisos = 'admin'`,
                        (err) => {
                            db.close();
                            
                            if (err) {
                                console.error('Error al crear notificación:', err);
                            }

                            res.status(201).json({
                                success: true,
                                message: 'Solicitud de día libre enviada exitosamente',
                                data: {
                                    id: this.lastID,
                                    fecha,
                                    tipo,
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

// Obtener mis días libres
router.get('/mis-dias-libres', authenticateToken, (req, res) => {
    const { limite = 50 } = req.query;
    const empleadoId = req.user.id;

    const db = new sqlite3.Database(dbPath);

    db.all(
        `SELECT * FROM dias_libres 
         WHERE empleado_id = ?
         ORDER BY fecha DESC
         LIMIT ?`,
        [empleadoId, parseInt(limite)],
        (err, diasLibres) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener días libres'
                });
            }

            res.json({
                success: true,
                data: diasLibres
            });
        }
    );
});

// Obtener todas las solicitudes de días libres (solo admin)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const { estado, empleado_id, limite = 50 } = req.query;

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT dl.*, e.nombre, e.apellido, e.email, e_aprobador.nombre as aprobador_nombre, e_aprobador.apellido as aprobador_apellido
        FROM dias_libres dl
        INNER JOIN empleados e ON dl.empleado_id = e.id
        LEFT JOIN empleados e_aprobador ON dl.aprobado_por = e_aprobador.id
        WHERE 1=1
    `;
    let params = [];

    if (estado) {
        query += ' AND dl.estado = ?';
        params.push(estado);
    }

    if (empleado_id) {
        query += ' AND dl.empleado_id = ?';
        params.push(empleado_id);
    }

    query += ' ORDER BY dl.fecha DESC LIMIT ?';
    params.push(parseInt(limite));

    db.all(query, params, (err, diasLibres) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener días libres'
            });
        }

        res.json({
            success: true,
            data: diasLibres
        });
    });
});

// Aprobar/Rechazar día libre (solo admin)
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
        'SELECT * FROM dias_libres WHERE id = ?',
        [id],
        (err, diaLibre) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar solicitud'
                });
            }

            if (!diaLibre) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Solicitud de día libre no encontrada'
                });
            }

            if (diaLibre.estado !== 'pendiente') {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Esta solicitud ya ha sido procesada'
                });
            }

            // Actualizar estado
            const fechaAprobacion = moment().format('YYYY-MM-DD HH:mm:ss');
            
            db.run(
                'UPDATE dias_libres SET estado = ?, motivo = ?, aprobado_por = ? WHERE id = ?',
                [estado, observaciones, req.user.id, id],
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
                        ? `Tu solicitud de día libre para ${moment(diaLibre.fecha).format('DD/MM/YYYY')} ha sido aprobada`
                        : `Tu solicitud de día libre para ${moment(diaLibre.fecha).format('DD/MM/YYYY')} ha sido rechazada`;

                    db.run(
                        'INSERT INTO notificaciones (empleado_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)',
                        [diaLibre.empleado_id, `Día Libre ${estado === 'aprobado' ? 'Aprobado' : 'Rechazado'}`, mensaje, estado === 'aprobado' ? 'success' : 'warning'],
                        (err) => {
                            db.close();
                            
                            if (err) {
                                console.error('Error al crear notificación:', err);
                            }

                            res.json({
                                success: true,
                                message: `Día libre ${estado === 'aprobado' ? 'aprobado' : 'rechazado'} exitosamente`
                            });
                        }
                    );
                }
            );
        }
    );
});

// Cancelar día libre (solo el empleado propietario)
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const empleadoId = req.user.id;

    const db = new sqlite3.Database(dbPath);

    // Verificar que la solicitud existe y pertenece al empleado
    db.get(
        'SELECT * FROM dias_libres WHERE id = ? AND empleado_id = ?',
        [id, empleadoId],
        (err, diaLibre) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar solicitud'
                });
            }

            if (!diaLibre) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Solicitud de día libre no encontrada'
                });
            }

            if (diaLibre.estado !== 'pendiente') {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'Solo se pueden cancelar solicitudes pendientes'
                });
            }

            // Eliminar solicitud
            db.run(
                'DELETE FROM dias_libres WHERE id = ?',
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
                        message: 'Solicitud de día libre cancelada exitosamente'
                    });
                }
            );
        }
    );
});

module.exports = router;
