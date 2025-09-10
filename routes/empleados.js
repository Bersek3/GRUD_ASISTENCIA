const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Obtener todos los empleados (solo admin)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const db = new sqlite3.Database(dbPath);
    const { tipo } = req.query;
    
    let query = `SELECT e.*, r.nombre as rol_nombre, r.descripcion as rol_descripcion
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id`;
    
    let params = [];
    
    // Filtrar por tipo de empleado si se especifica
    if (tipo) {
        query += ` WHERE e.tipo_empleado = ?`;
        params.push(tipo);
    }
    
    query += ` ORDER BY e.nombre, e.apellido`;
    
    db.all(query, params, (err, empleados) => {
        db.close();
        
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error al obtener empleados'
            });
        }

        // Ocultar password_hash de la respuesta
        const empleadosSinPassword = empleados.map(emp => {
            const { password_hash, ...empleadoSinPassword } = emp;
            return empleadoSinPassword;
        });

        res.json({
            success: true,
            data: empleadosSinPassword
        });
    });
});

// Crear nuevo empleado part-time (solo admin)
router.post('/part-time', authenticateToken, requireAdmin, (req, res) => {
    const {
        nombre,
        email,
        telefono,
        rol_id,
        dias_disponibles,
        max_horas_semana,
        disponible_fines_semana,
        disponible_feriados,
        cobertura_vacaciones,
        cobertura_enfermedades,
        cobertura_emergencias,
        cobertura_horas_extra,
        salario_hora,
        fecha_inicio,
        notas
    } = req.body;

    // Validación específica para empleados part-time
    if (!nombre || !email) {
        return res.status(400).json({
            success: false,
            message: 'Nombre y email son requeridos para empleados part-time'
        });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Por favor ingresa un email válido'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Generar contraseña por defecto para empleados part-time
    const defaultPassword = 'parttime123';
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);

    // Preparar datos para inserción
    const insertData = [
        nombre,
        '', // apellido vacío para part-time
        email,
        telefono || null,
        null, // direccion
        null, // fecha_nacimiento
        fecha_inicio || new Date().toISOString().split('T')[0], // fecha_contratacion
        rol_id || null, // rol_id opcional
        passwordHash,
        'PART_TIME', // tipo_empleado
        dias_disponibles || null,
        max_horas_semana || 20,
        disponible_fines_semana ? 1 : 0,
        disponible_feriados ? 1 : 0,
        cobertura_vacaciones ? 1 : 0,
        cobertura_enfermedades ? 1 : 0,
        cobertura_emergencias ? 1 : 0,
        cobertura_horas_extra ? 1 : 0,
        salario_hora || null,
        notas || null
    ];

    db.run(
        `INSERT INTO empleados 
         (nombre, apellido, email, telefono, direccion, fecha_nacimiento, 
          fecha_contratacion, rol_id, password_hash, tipo_empleado, dias_disponibles,
          max_horas_semana, disponible_fines_semana, disponible_feriados,
          cobertura_vacaciones, cobertura_enfermedades, cobertura_emergencias,
          cobertura_horas_extra, salario_hora, notas) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        insertData,
        function(err) {
            if (err) {
                db.close();
                console.error('Error al crear empleado part-time:', err);
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'El email ya está registrado'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al crear empleado part-time: ' + err.message
                });
            }

            const empleadoId = this.lastID;
            
            // Obtener el empleado creado con información del rol
            db.get(
                `SELECT e.*, r.nombre as rol_nombre 
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id 
                 WHERE e.id = ?`,
                [empleadoId],
                (err, empleado) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Empleado part-time creado pero error al obtener datos'
                        });
                    }

                    // Ocultar password_hash de la respuesta
                    const { password_hash, ...empleadoSinPassword } = empleado;

                    res.json({
                        success: true,
                        message: 'Empleado part-time creado exitosamente',
                        data: empleadoSinPassword
                    });
                }
            );
        }
    );
});

// Actualizar horarios de empleado part-time
router.put('/:id/horarios', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { horarios } = req.body;
    
    if (!horarios || !Array.isArray(horarios)) {
        return res.status(400).json({
            success: false,
            message: 'Los horarios deben ser un array válido'
        });
    }
    
    const db = new sqlite3.Database(dbPath);
    
    // Iniciar transacción
    db.serialize(() => {
        // Eliminar horarios existentes del empleado
        db.run(
            'DELETE FROM empleado_horarios WHERE empleado_id = ?',
            [id],
            function(err) {
                if (err) {
                    db.close();
                    return res.status(500).json({
                        success: false,
                        message: 'Error al eliminar horarios existentes'
                    });
                }
                
                // Insertar nuevos horarios
                if (horarios.length > 0) {
                    const stmt = db.prepare(`
                        INSERT INTO empleado_horarios 
                        (empleado_id, horario_id, fecha_inicio, activo) 
                        VALUES (?, ?, ?, ?)
                    `);
                    
                    let completed = 0;
                    let hasError = false;
                    
                    horarios.forEach(horario => {
                        stmt.run([
                            id,
                            horario.horario_id,
                            new Date().toISOString().split('T')[0], // fecha_inicio
                            1 // activo
                        ], function(err) {
                            if (err && !hasError) {
                                hasError = true;
                                stmt.finalize();
                                db.close();
                                return res.status(500).json({
                                    success: false,
                                    message: 'Error al insertar horarios: ' + err.message
                                });
                            }
                            
                            completed++;
                            if (completed === horarios.length && !hasError) {
                                stmt.finalize();
                                
                                // Obtener el empleado actualizado con sus horarios
                                db.get(
                                    `SELECT e.*, r.nombre as rol_nombre 
                                     FROM empleados e 
                                     LEFT JOIN roles r ON e.rol_id = r.id 
                                     WHERE e.id = ?`,
                                    [id],
                                    (err, empleado) => {
                                        db.close();
                                        
                                        if (err) {
                                            return res.status(500).json({
                                                success: false,
                                                message: 'Horarios actualizados pero error al obtener empleado'
                                            });
                                        }
                                        
                                        // Ocultar password_hash
                                        const { password_hash, ...empleadoSinPassword } = empleado;
                                        
                                        res.json({
                                            success: true,
                                            message: 'Horarios actualizados exitosamente',
                                            data: empleadoSinPassword
                                        });
                                    }
                                );
                            }
                        });
                    });
                } else {
                    // No hay horarios para insertar, solo eliminar los existentes
                    db.close();
                    res.json({
                        success: true,
                        message: 'Horarios eliminados exitosamente',
                        data: { id: id }
                    });
                }
            }
        );
    });
});

// Obtener empleado por ID
router.get('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si el usuario puede ver este empleado
    const canView = req.user.permisos === 'admin' || req.user.id == id;

    if (!canView) {
        db.close();
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver este empleado'
        });
    }

    // Obtener empleado con sus horarios asignados
    db.get(
        `SELECT e.*, r.nombre as rol_nombre, r.descripcion as rol_descripcion
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         WHERE e.id = ?`,
        [id],
        (err, empleado) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener empleado'
                });
            }

            if (!empleado) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Obtener horarios asignados del empleado
            db.all(
                `SELECT eh.*, h.nombre as horario_nombre, h.hora_entrada, h.hora_salida, h.dias_semana
                 FROM empleado_horarios eh
                 LEFT JOIN horarios h ON eh.horario_id = h.id
                 WHERE eh.empleado_id = ? AND eh.activo = 1`,
                [id],
                (err, horarios) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al obtener horarios del empleado'
                        });
                    }

                    // Ocultar password_hash de la respuesta
                    const { password_hash, ...empleadoSinPassword } = empleado;
                    
                    // Agregar horarios asignados al empleado
                    empleadoSinPassword.horarios_asignados = horarios || [];

                    res.json({
                        success: true,
                        data: empleadoSinPassword
                    });
                }
            );
        }
    );
});

// Crear nuevo empleado (solo admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    const {
        nombre,
        apellido,
        email,
        telefono,
        direccion,
        fecha_nacimiento,
        fecha_contratacion,
        rol_id,
        password,
        horario_personalizado
    } = req.body;

    if (!nombre || !apellido || !email || !password || !rol_id) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, apellido, email, contraseña y rol son requeridos'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La contraseña debe tener al menos 6 caracteres'
        });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const db = new sqlite3.Database(dbPath);

    db.run(
        `INSERT INTO empleados 
         (nombre, apellido, email, telefono, direccion, fecha_nacimiento, 
          fecha_contratacion, rol_id, password_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, apellido, email, telefono, direccion, fecha_nacimiento, 
         fecha_contratacion, rol_id, passwordHash],
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'El email ya está registrado'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al crear empleado'
                });
            }

            const empleadoId = this.lastID;
            
            // Si hay horario personalizado, crearlo
            if (horario_personalizado && horario_personalizado.length > 0) {
                createPersonalizedSchedule(db, empleadoId, horario_personalizado, (err) => {
                    if (err) {
                        db.close();
                        return res.status(500).json({
                            success: false,
                            message: 'Empleado creado pero error al crear horario personalizado'
                        });
                    }
                    
                    // Obtener el empleado creado
                    db.get(
                        `SELECT e.*, r.nombre as rol_nombre 
                         FROM empleados e 
                         LEFT JOIN roles r ON e.rol_id = r.id 
                         WHERE e.id = ?`,
                        [empleadoId],
                        (err, empleado) => {
                            db.close();
                            
                            if (err) {
                                return res.status(500).json({
                                    success: false,
                                    message: 'Empleado creado pero error al obtener datos'
                                });
                            }

                            const { password_hash, ...empleadoSinPassword } = empleado;

                            // Regenerar calendario de horarios después de crear empleado
                            regenerateScheduleCalendar();

                            res.status(201).json({
                                success: true,
                                message: 'Empleado creado exitosamente con horario personalizado. Calendario de horarios regenerado.',
                                data: empleadoSinPassword
                            });
                        }
                    );
                });
            } else {
                // Obtener el empleado creado sin horario personalizado
                db.get(
                    `SELECT e.*, r.nombre as rol_nombre 
                     FROM empleados e 
                     LEFT JOIN roles r ON e.rol_id = r.id 
                     WHERE e.id = ?`,
                    [empleadoId],
                    (err, empleado) => {
                        db.close();
                        
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                message: 'Empleado creado pero error al obtener datos'
                            });
                        }

                        const { password_hash, ...empleadoSinPassword } = empleado;

                        // Regenerar calendario de horarios después de crear empleado
                        regenerateScheduleCalendar();

                        res.status(201).json({
                            success: true,
                            message: 'Empleado creado exitosamente. Calendario de horarios regenerado.',
                            data: empleadoSinPassword
                        });
                    }
                );
            }
        }
    );
});

// Actualizar empleado
router.put('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const {
        nombre,
        apellido,
        email,
        telefono,
        direccion,
        fecha_nacimiento,
        fecha_contratacion,
        rol_id,
        activo
    } = req.body;

    // Verificar permisos
    const canUpdate = req.user.permisos === 'admin' || req.user.id == id;

    if (!canUpdate) {
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para actualizar este empleado'
        });
    }

    // Solo admin puede cambiar rol y estado activo
    if (req.user.permisos !== 'admin' && (rol_id !== undefined || activo !== undefined)) {
        return res.status(403).json({
            success: false,
            message: 'Solo los administradores pueden cambiar el rol o estado del empleado'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Construir query dinámicamente
    const updates = [];
    const values = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (apellido !== undefined) { updates.push('apellido = ?'); values.push(apellido); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (telefono !== undefined) { updates.push('telefono = ?'); values.push(telefono); }
    if (direccion !== undefined) { updates.push('direccion = ?'); values.push(direccion); }
    if (fecha_nacimiento !== undefined) { updates.push('fecha_nacimiento = ?'); values.push(fecha_nacimiento); }
    if (fecha_contratacion !== undefined) { updates.push('fecha_contratacion = ?'); values.push(fecha_contratacion); }
    if (rol_id !== undefined && req.user.permisos === 'admin') { updates.push('rol_id = ?'); values.push(rol_id); }
    if (activo !== undefined && req.user.permisos === 'admin') { updates.push('activo = ?'); values.push(activo); }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No hay campos para actualizar'
        });
    }

    values.push(id);

    db.run(
        `UPDATE empleados SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'El email ya está registrado'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar empleado'
                });
            }

            if (this.changes === 0) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Obtener empleado actualizado
            db.get(
                `SELECT e.*, r.nombre as rol_nombre 
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id 
                 WHERE e.id = ?`,
                [id],
                (err, empleado) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Empleado actualizado pero error al obtener datos'
                        });
                    }

                    const { password_hash, ...empleadoSinPassword } = empleado;

                    // Regenerar calendario de horarios después de actualizar empleado
                    regenerateScheduleCalendar();

                    res.json({
                        success: true,
                        message: 'Empleado actualizado exitosamente. Calendario de horarios regenerado.',
                        data: empleadoSinPassword
                    });
                }
            );
        }
    );
});

// Eliminar empleado (solo admin)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // No permitir eliminar el propio usuario
    if (req.user.id == id) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No puedes eliminar tu propia cuenta'
        });
    }

    db.run(
        'DELETE FROM empleados WHERE id = ?',
        [id],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al eliminar empleado'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Regenerar calendario de horarios después de eliminar empleado
            regenerateScheduleCalendar();

            res.json({
                success: true,
                message: 'Empleado eliminado exitosamente. Calendario de horarios regenerado.'
            });
        }
    );
});

// Obtener estadísticas de empleados (solo admin)
router.get('/stats/overview', authenticateToken, requireAdmin, (req, res) => {
    const db = new sqlite3.Database(dbPath);

    const queries = [
        'SELECT COUNT(*) as total FROM empleados WHERE activo = 1',
        'SELECT COUNT(*) as total FROM empleados WHERE activo = 0',
        'SELECT COUNT(*) as total FROM asistencia WHERE DATE(created_at) = DATE("now")',
        'SELECT COUNT(*) as total FROM vacaciones WHERE estado = "pendiente"'
    ];

    Promise.all(queries.map(query => 
        new Promise((resolve, reject) => {
            db.get(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        })
    )).then(results => {
        db.close();
        res.json({
            success: true,
            data: {
                empleadosActivos: results[0].total,
                empleadosInactivos: results[1].total,
                asistenciasHoy: results[2].total,
                vacacionesPendientes: results[3].total
            }
        });
    }).catch(err => {
        db.close();
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    });
});

// Actualizar tiempo de colación de un empleado (solo admin)
router.put('/:id/colacion', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { tiempo_colacion } = req.body;

    // Validar que el tiempo de colación sea un número válido entre 0 y 120 minutos
    if (!tiempo_colacion || isNaN(tiempo_colacion) || tiempo_colacion < 0 || tiempo_colacion > 120) {
        return res.status(400).json({
            success: false,
            message: 'El tiempo de colación debe ser un número entre 0 y 120 minutos'
        });
    }

    const db = new sqlite3.Database(dbPath);
    
    db.run(
        'UPDATE empleados SET tiempo_colacion = ? WHERE id = ?',
        [tiempo_colacion, id],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar tiempo de colación'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            res.json({
                success: true,
                message: 'Tiempo de colación actualizado correctamente'
            });
        }
    );
});

// Obtener tiempo de colación de un empleado
router.get('/:id/colacion', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar permisos: solo el empleado puede ver su tiempo de colación o un admin
    if (req.user.rol !== 'admin' && req.user.id != id) {
        db.close();
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver esta información'
        });
    }
    
    db.get(
        'SELECT tiempo_colacion FROM empleados WHERE id = ?',
        [id],
        (err, row) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener tiempo de colación'
                });
            }

            if (!row) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            res.json({
                success: true,
                tiempo_colacion: row.tiempo_colacion
            });
        }
    );
});

// Función para regenerar el calendario de horarios
function regenerateScheduleCalendar() {
    const db = new sqlite3.Database(dbPath);
    
    // Obtener todos los empleados activos
    db.all(
        'SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY id',
        (err, empleados) => {
            if (err) {
                console.error('Error al obtener empleados para regenerar calendario:', err);
                db.close();
                return;
            }

            console.log(`🔄 Regenerando calendario de horarios para ${empleados.length} empleados`);
            console.log('👥 Empleados activos:', empleados.map(e => `${e.nombre} ${e.apellido}`).join(', '));
            
            // Limpiar horarios existentes (opcional - comentado para preservar historial)
            // db.run('DELETE FROM empleado_horarios', (err) => {
            //     if (err) {
            //         console.error('Error al limpiar horarios existentes:', err);
            //     }
            // });

            // Aquí se podría implementar la lógica de regeneración del calendario
            // Por ahora solo registramos que se debe regenerar
            console.log('✅ Calendario de horarios marcado para regeneración');
            console.log('📅 El frontend debe regenerar el calendario oficial');
            
            db.close();
        }
    );
}

// Función para crear horario personalizado
function createPersonalizedSchedule(db, empleadoId, horarioData, callback) {
    console.log('Creando horario personalizado para empleado:', empleadoId);
    console.log('Datos del horario:', horarioData);
    
    // Mapeo de días en español a números
    const dayMapping = {
        'lunes': 1,
        'martes': 2,
        'miercoles': 3,
        'jueves': 4,
        'viernes': 5,
        'sabado': 6,
        'domingo': 7
    };
    
    // Crear un horario único para este empleado
    const horarioNombre = `Horario Personalizado - Empleado ${empleadoId}`;
    const diasSemana = horarioData.map(h => dayMapping[h.day]).sort().join(',');
    
    // Calcular horas totales para validación (considerando colación)
    let totalHoras = 0;
    let totalColacion = 0;
    horarioData.forEach(h => {
        const entrada = new Date(`2000-01-01T${h.entrada}`);
        const salida = new Date(`2000-01-01T${h.salida}`);
        
        if (salida <= entrada) {
            salida.setDate(salida.getDate() + 1);
        }
        
        const diffMs = salida - entrada;
        const diffHours = diffMs / (1000 * 60 * 60);
        
        // Restar 30 minutos de colación si la jornada es mayor a 5.5 horas
        let horasTrabajadas = diffHours;
        if (diffHours > 5.5) {
            horasTrabajadas = diffHours - 0.5;
            totalColacion += 0.5;
        }
        
        totalHoras += horasTrabajadas;
    });
    
    // Validar límite de 44 horas semanales
    if (totalHoras > 44) {
        return callback(new Error('El horario excede las 44 horas semanales máximas permitidas por la ley chilena'));
    }
    
    // Crear el horario
    const descripcion = totalColacion > 0 
        ? `Horario personalizado: ${totalHoras.toFixed(1)}h trabajadas + ${totalColacion}h colación = ${(totalHoras + totalColacion).toFixed(1)}h totales`
        : `Horario personalizado con ${totalHoras.toFixed(1)} horas semanales`;
    
    db.run(
        `INSERT INTO horarios (nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [horarioNombre, '00:00', '00:00', diasSemana, descripcion, 1],
        function(err) {
            if (err) {
                console.error('Error al crear horario:', err);
                return callback(err);
            }
            
            const horarioId = this.lastID;
            console.log('Horario creado con ID:', horarioId);
            
            // Asignar el horario al empleado
            db.run(
                `INSERT INTO empleado_horarios (empleado_id, horario_id, fecha_inicio, activo) 
                 VALUES (?, ?, CURRENT_DATE, ?)`,
                [empleadoId, horarioId, 1],
                function(err) {
                    if (err) {
                        console.error('Error al asignar horario al empleado:', err);
                        return callback(err);
                    }
                    
                    console.log('Horario asignado al empleado exitosamente');
                    callback(null);
                }
            );
        }
    );
}

module.exports = router;
