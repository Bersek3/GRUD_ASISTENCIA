const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Obtener todos los horarios
router.get('/', authenticateToken, (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(
        'SELECT * FROM horarios ORDER BY nombre',
        (err, horarios) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener horarios'
                });
            }

            // Procesar días de la semana para mejor legibilidad
            const horariosProcesados = horarios.map(horario => ({
                ...horario,
                dias_semana_array: horario.dias_semana.split(',').map(d => parseInt(d)),
                dias_semana_nombres: horario.dias_semana.split(',').map(d => {
                    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    return dias[parseInt(d)];
                })
            }));

            res.json({
                success: true,
                data: horariosProcesados
            });
        }
    );
});

// Obtener horario por ID
router.get('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    db.get(
        'SELECT * FROM horarios WHERE id = ?',
        [id],
        (err, horario) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener horario'
                });
            }

            if (!horario) {
                return res.status(404).json({
                    success: false,
                    message: 'Horario no encontrado'
                });
            }

            // Procesar días de la semana
            const horarioProcesado = {
                ...horario,
                dias_semana_array: horario.dias_semana.split(',').map(d => parseInt(d)),
                dias_semana_nombres: horario.dias_semana.split(',').map(d => {
                    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    return dias[parseInt(d)];
                })
            };

            res.json({
                success: true,
                data: horarioProcesado
            });
        }
    );
});

// Crear nuevo horario (solo admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    const { nombre, hora_entrada, hora_salida, dias_semana, descripcion } = req.body;

    if (!nombre || !hora_entrada || !hora_salida || !dias_semana) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, hora de entrada, hora de salida y días de la semana son requeridos'
        });
    }

    // Validar formato de días de la semana
    const diasArray = dias_semana.split(',').map(d => parseInt(d.trim()));
    if (diasArray.some(d => d < 0 || d > 6)) {
        return res.status(400).json({
            success: false,
            message: 'Los días de la semana deben ser números del 0 al 6 (0=Domingo, 6=Sábado)'
        });
    }

    const db = new sqlite3.Database(dbPath);

    db.run(
        'INSERT INTO horarios (nombre, hora_entrada, hora_salida, dias_semana, descripcion) VALUES (?, ?, ?, ?, ?)',
        [nombre, hora_entrada, hora_salida, dias_semana, descripcion],
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe un horario con ese nombre'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al crear horario'
                });
            }

            // Obtener el horario creado
            db.get(
                'SELECT * FROM horarios WHERE id = ?',
                [this.lastID],
                (err, horario) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Horario creado pero error al obtener datos'
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: 'Horario creado exitosamente',
                        data: horario
                    });
                }
            );
        }
    );
});

// Actualizar horario (solo admin)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo } = req.body;

    const db = new sqlite3.Database(dbPath);

    // Verificar si el horario existe
    db.get(
        'SELECT * FROM horarios WHERE id = ?',
        [id],
        (err, horarioExistente) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar horario'
                });
            }

            if (!horarioExistente) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Horario no encontrado'
                });
            }

            // Validar días de la semana si se proporcionan
            if (dias_semana) {
                const diasArray = dias_semana.split(',').map(d => parseInt(d.trim()));
                if (diasArray.some(d => d < 0 || d > 6)) {
                    db.close();
                    return res.status(400).json({
                        success: false,
                        message: 'Los días de la semana deben ser números del 0 al 6 (0=Domingo, 6=Sábado)'
                    });
                }
            }

            // Actualizar horario
            db.run(
                'UPDATE horarios SET nombre = ?, hora_entrada = ?, hora_salida = ?, dias_semana = ?, descripcion = ?, activo = ? WHERE id = ?',
                [nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo, id],
                function(err) {
                    if (err) {
                        db.close();
                        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                            return res.status(400).json({
                                success: false,
                                message: 'Ya existe un horario con ese nombre'
                            });
                        }
                        return res.status(500).json({
                            success: false,
                            message: 'Error al actualizar horario'
                        });
                    }

                    // Obtener horario actualizado
                    db.get(
                        'SELECT * FROM horarios WHERE id = ?',
                        [id],
                        (err, horario) => {
                            db.close();
                            
                            if (err) {
                                return res.status(500).json({
                                    success: false,
                                    message: 'Horario actualizado pero error al obtener datos'
                                });
                            }

                            res.json({
                                success: true,
                                message: 'Horario actualizado exitosamente',
                                data: horario
                            });
                        }
                    );
                }
            );
        }
    );
});

// Eliminar horario (solo admin)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si hay empleados usando este horario
    db.get(
        'SELECT COUNT(*) as count FROM empleado_horarios WHERE horario_id = ? AND activo = 1',
        [id],
        (err, result) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar asignaciones de horario'
                });
            }

            if (result.count > 0) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el horario porque hay empleados asignados a él'
                });
            }

            // Eliminar horario
            db.run(
                'DELETE FROM horarios WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al eliminar horario'
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'Horario no encontrado'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Horario eliminado exitosamente'
                    });
                }
            );
        }
    );
});

// Asignar horario a empleado (solo admin)
router.post('/:id/asignar', authenticateToken, requireAdmin, (req, res) => {
    const { id: horarioId } = req.params;
    const { empleado_id, fecha_inicio, fecha_fin } = req.body;

    if (!empleado_id || !fecha_inicio) {
        return res.status(400).json({
            success: false,
            message: 'ID del empleado y fecha de inicio son requeridos'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Verificar que el horario existe
    db.get(
        'SELECT * FROM horarios WHERE id = ? AND activo = 1',
        [horarioId],
        (err, horario) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar horario'
                });
            }

            if (!horario) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Horario no encontrado o inactivo'
                });
            }

            // Verificar que el empleado existe
            db.get(
                'SELECT * FROM empleados WHERE id = ? AND activo = 1',
                [empleado_id],
                (err, empleado) => {
                    if (err) {
                        db.close();
                        return res.status(500).json({
                            success: false,
                            message: 'Error al verificar empleado'
                        });
                    }

                    if (!empleado) {
                        db.close();
                        return res.status(404).json({
                            success: false,
                            message: 'Empleado no encontrado o inactivo'
                        });
                    }

                    // Desactivar horarios anteriores del empleado
                    db.run(
                        'UPDATE empleado_horarios SET activo = 0 WHERE empleado_id = ?',
                        [empleado_id],
                        (err) => {
                            if (err) {
                                db.close();
                                return res.status(500).json({
                                    success: false,
                                    message: 'Error al desactivar horarios anteriores'
                                });
                            }

                            // Asignar nuevo horario
                            db.run(
                                'INSERT INTO empleado_horarios (empleado_id, horario_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
                                [empleado_id, horarioId, fecha_inicio, fecha_fin],
                                function(err) {
                                    db.close();
                                    
                                    if (err) {
                                        return res.status(500).json({
                                            success: false,
                                            message: 'Error al asignar horario'
                                        });
                                    }

                                    res.status(201).json({
                                        success: true,
                                        message: 'Horario asignado exitosamente'
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// Obtener horarios de un empleado
router.get('/empleado/:empleadoId', authenticateToken, (req, res) => {
    const { empleadoId } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar permisos
    const canView = req.user.permisos === 'admin' || req.user.id == empleadoId;

    if (!canView) {
        db.close();
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver los horarios de este empleado'
        });
    }

    db.all(
        `SELECT h.*, eh.fecha_inicio, eh.fecha_fin, eh.activo as asignacion_activa
         FROM horarios h
         INNER JOIN empleado_horarios eh ON h.id = eh.horario_id
         WHERE eh.empleado_id = ?
         ORDER BY eh.fecha_inicio DESC`,
        [empleadoId],
        (err, horarios) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener horarios del empleado'
                });
            }

            res.json({
                success: true,
                data: horarios
            });
        }
    );
});

// Actualizar horario
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo } = req.body;

    if (!nombre || !hora_entrada || !hora_salida || !dias_semana) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, hora de entrada, hora de salida y días de la semana son requeridos'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Construir query dinámicamente
    const updates = [];
    const values = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (hora_entrada !== undefined) { updates.push('hora_entrada = ?'); values.push(hora_entrada); }
    if (hora_salida !== undefined) { updates.push('hora_salida = ?'); values.push(hora_salida); }
    if (dias_semana !== undefined) { updates.push('dias_semana = ?'); values.push(dias_semana); }
    if (descripcion !== undefined) { updates.push('descripcion = ?'); values.push(descripcion); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo); }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No hay campos para actualizar'
        });
    }

    values.push(id);

    db.run(
        `UPDATE horarios SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(err) {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar horario'
                });
            }

            if (this.changes === 0) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Horario no encontrado'
                });
            }

            // Obtener horario actualizado
            db.get(
                'SELECT * FROM horarios WHERE id = ?',
                [id],
                (err, horario) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Horario actualizado pero error al obtener datos'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Horario actualizado exitosamente',
                        data: horario
                    });
                }
            );
        }
    );
});

// Eliminar horario
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si hay empleados asignados a este horario
    db.get(
        'SELECT COUNT(*) as count FROM empleado_horarios WHERE horario_id = ? AND activo = 1',
        [id],
        (err, result) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar dependencias'
                });
            }

            if (result.count > 0) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el horario porque hay empleados asignados a él'
                });
            }

            db.run(
                'DELETE FROM horarios WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al eliminar horario'
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'Horario no encontrado'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Horario eliminado exitosamente'
                    });
                }
            );
        }
    );
});

module.exports = router;
