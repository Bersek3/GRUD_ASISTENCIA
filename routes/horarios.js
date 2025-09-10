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

// Obtener todos los horarios de empleados (para el calendario)
router.get('/empleados-calendario', authenticateToken, (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    // Obtener empleados activos con sus horarios asignados
    db.all(
        `SELECT 
            e.id as empleado_id,
            e.nombre,
            e.apellido,
            r.nombre as rol,
            h.id as horario_id,
            h.nombre as horario_nombre,
            h.hora_entrada,
            h.hora_salida,
            h.dias_semana as dias_trabajo,
            eh.fecha_inicio,
            eh.fecha_fin,
            eh.activo as estado_asignacion,
            CASE 
                WHEN eh.activo = 1 THEN 'ACTIVO'
                ELSE 'INACTIVO'
            END as estado
         FROM empleados e
         LEFT JOIN empleado_horarios eh ON e.id = eh.empleado_id AND eh.activo = 1
         LEFT JOIN horarios h ON eh.horario_id = h.id
         LEFT JOIN roles r ON e.rol_id = r.id
         WHERE e.activo = 1
         ORDER BY e.id, eh.fecha_inicio DESC`,
        (err, horarios) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener horarios de empleados'
                });
            }

            // Filtrar solo empleados que tienen horarios asignados
            const horariosActivos = horarios.filter(h => h.horario_id !== null);
            
            db.close();
            res.json({
                success: true,
                horarios: horariosActivos
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

// Función para generar horarios con rotación equitativa
function generateRotationSchedules(empleados) {
    const horarios = [];
    const fechaActual = new Date();
    const semanaActual = getWeekNumber(fechaActual);
    
    // Definir secuencia de rotación
    const secuenciaRotacion = [
        { rol: 'centralista', turno: 'CENTRALISTA_MANANA', horario: 'Centralista Turno Mañana', dias: '1,2,3,4,5,6,0', entrada: '07:00', salida: '16:00' },
        { rol: 'centralista', turno: 'CENTRALISTA_TARDE', horario: 'Centralista Turno Tarde', dias: '1,2,3,4,5,6', entrada: '14:30', salida: '23:30' },
        { rol: 'despachador', turno: 'DESPACHADOR_MANANA', horario: 'Despachador Turno Mañana', dias: '1,2,3,4,5,6', entrada: '07:00', salida: '15:00' },
        { rol: 'despachador', turno: 'DESPACHADOR_TARDE', horario: 'Despachador Turno Tarde', dias: '1,2,3,4,5,6', entrada: '15:00', salida: '23:00' },
        { rol: 'turno_noche', turno: 'TURNO_NOCHE', horario: 'Turno Noche', dias: '0,1,2,3,4,5,6', entrada: '23:30', salida: '07:00' }
    ];
    
    empleados.forEach((empleado, index) => {
        // Calcular posición en la rotación basada en la semana actual
        const posicionRotacion = (semanaActual + index) % secuenciaRotacion.length;
        const asignacionActual = secuenciaRotacion[posicionRotacion];
        
        // Verificar si es empleado part-time
        if (empleado.rol === 'part time') {
            // Part-time solo trabaja fines de semana
            horarios.push({
                empleado_id: empleado.id,
                nombre: empleado.nombre,
                apellido: empleado.apellido,
                rol: empleado.rol,
                horario_id: 6, // Part Time Sábado Noche
                horario_nombre: 'Part Time Sábado Noche',
                hora_entrada: '23:30',
                hora_salida: '07:00',
                dias_trabajo: '6', // Solo Sábado
                estado: 'ACTIVO',
                turno: 'PART_TIME_SABADO_NOCHE'
            });
            
            horarios.push({
                empleado_id: empleado.id,
                nombre: empleado.nombre,
                apellido: empleado.apellido,
                rol: empleado.rol,
                horario_id: 7, // Part Time Domingo Tarde
                horario_nombre: 'Part Time Domingo Tarde',
                hora_entrada: '15:00',
                hora_salida: '23:00',
                dias_trabajo: '0', // Solo Domingo
                estado: 'ACTIVO',
                turno: 'PART_TIME_DOMINGO_TARDE'
            });
        } else {
            // Empleados regulares con rotación
            horarios.push({
                empleado_id: empleado.id,
                nombre: empleado.nombre,
                apellido: empleado.apellido,
                rol: empleado.rol,
                horario_id: posicionRotacion + 1,
                horario_nombre: asignacionActual.horario,
                hora_entrada: asignacionActual.entrada,
                hora_salida: asignacionActual.salida,
                dias_trabajo: asignacionActual.dias,
                estado: 'ACTIVO',
                turno: asignacionActual.turno
            });
        }
    });
    
    return horarios;
}

// Función para obtener el número de semana del año
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Actualizar horario
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo } = req.body;

    if (!nombre || !hora_entrada || !hora_salida) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, hora de entrada y hora de salida son requeridos'
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
