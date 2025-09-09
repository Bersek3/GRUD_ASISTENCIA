const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Obtener notificaciones del usuario actual
router.get('/', authenticateToken, (req, res) => {
    const { limite = 20, no_leidas = false } = req.query;
    const empleadoId = req.user.id;

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT * FROM notificaciones 
        WHERE empleado_id = ? OR empleado_id IS NULL
    `;
    let params = [empleadoId];

    if (no_leidas === 'true') {
        query += ' AND leida = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limite));

    db.all(query, params, (err, notificaciones) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener notificaciones'
            });
        }

        res.json({
            success: true,
            data: notificaciones
        });
    });
});

// Marcar notificación como leída
router.put('/:id/leer', authenticateToken, (req, res) => {
    const { id } = req.params;
    const empleadoId = req.user.id;

    const db = new sqlite3.Database(dbPath);

    // Verificar que la notificación pertenece al usuario
    db.get(
        'SELECT * FROM notificaciones WHERE id = ? AND (empleado_id = ? OR empleado_id IS NULL)',
        [id, empleadoId],
        (err, notificacion) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar notificación'
                });
            }

            if (!notificacion) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Notificación no encontrada'
                });
            }

            // Marcar como leída
            db.run(
                'UPDATE notificaciones SET leida = 1 WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al marcar notificación como leída'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Notificación marcada como leída'
                    });
                }
            );
        }
    );
});

// Marcar todas las notificaciones como leídas
router.put('/marcar-todas-leidas', authenticateToken, (req, res) => {
    const empleadoId = req.user.id;
    const db = new sqlite3.Database(dbPath);

    db.run(
        'UPDATE notificaciones SET leida = 1 WHERE empleado_id = ? AND leida = 0',
        [empleadoId],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al marcar notificaciones como leídas'
                });
            }

            res.json({
                success: true,
                message: `${this.changes} notificaciones marcadas como leídas`
            });
        }
    );
});

// Obtener contador de notificaciones no leídas
router.get('/contador', authenticateToken, (req, res) => {
    const empleadoId = req.user.id;
    const db = new sqlite3.Database(dbPath);

    db.get(
        'SELECT COUNT(*) as total FROM notificaciones WHERE (empleado_id = ? OR empleado_id IS NULL) AND leida = 0',
        [empleadoId],
        (err, result) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener contador de notificaciones'
                });
            }

            res.json({
                success: true,
                data: {
                    notificaciones_no_leidas: result.total
                }
            });
        }
    );
});

module.exports = router;
