const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Obtener todos los roles
router.get('/', authenticateToken, (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(
        'SELECT * FROM roles ORDER BY nombre',
        (err, roles) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener roles'
                });
            }

            res.json({
                success: true,
                data: roles
            });
        }
    );
});

// Obtener rol por ID
router.get('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    db.get(
        'SELECT * FROM roles WHERE id = ?',
        [id],
        (err, rol) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener rol'
                });
            }

            if (!rol) {
                return res.status(404).json({
                    success: false,
                    message: 'Rol no encontrado'
                });
            }

            res.json({
                success: true,
                data: rol
            });
        }
    );
});

// Actualizar rol
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, permisos, salario_base } = req.body;

    if (!nombre) {
        return res.status(400).json({
            success: false,
            message: 'El nombre del rol es requerido'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Construir query dinámicamente
    const updates = [];
    const values = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (descripcion !== undefined) { updates.push('descripcion = ?'); values.push(descripcion); }
    if (permisos !== undefined) { updates.push('permisos = ?'); values.push(permisos); }
    if (salario_base !== undefined) { updates.push('salario_base = ?'); values.push(salario_base); }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No hay campos para actualizar'
        });
    }

    values.push(id);

    db.run(
        `UPDATE roles SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe un rol con ese nombre'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar rol'
                });
            }

            if (this.changes === 0) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Rol no encontrado'
                });
            }

            // Obtener rol actualizado
            db.get(
                'SELECT * FROM roles WHERE id = ?',
                [id],
                (err, rol) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Rol actualizado pero error al obtener datos'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Rol actualizado exitosamente',
                        data: rol
                    });
                }
            );
        }
    );
});

// Eliminar rol
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si hay empleados usando este rol
    db.get(
        'SELECT COUNT(*) as count FROM empleados WHERE rol_id = ?',
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
                    message: 'No se puede eliminar el rol porque hay empleados asignados a él'
                });
            }

            db.run(
                'DELETE FROM roles WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al eliminar rol'
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'Rol no encontrado'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Rol eliminado exitosamente'
                    });
                }
            );
        }
    );
});

// Crear nuevo rol (solo admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    const { nombre, descripcion, permisos, salario_base } = req.body;

    if (!nombre || !permisos) {
        return res.status(400).json({
            success: false,
            message: 'Nombre y permisos son requeridos'
        });
    }

    const db = new sqlite3.Database(dbPath);

    db.run(
        'INSERT INTO roles (nombre, descripcion, permisos, salario_base) VALUES (?, ?, ?, ?)',
        [nombre, descripcion, permisos, salario_base || 0],
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe un rol con ese nombre'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al crear rol'
                });
            }

            // Obtener el rol creado
            db.get(
                'SELECT * FROM roles WHERE id = ?',
                [this.lastID],
                (err, rol) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Rol creado pero error al obtener datos'
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: 'Rol creado exitosamente',
                        data: rol
                    });
                }
            );
        }
    );
});

// Actualizar rol (solo admin)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, permisos, salario_base } = req.body;

    const db = new sqlite3.Database(dbPath);

    // Verificar si el rol existe
    db.get(
        'SELECT * FROM roles WHERE id = ?',
        [id],
        (err, rolExistente) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar rol'
                });
            }

            if (!rolExistente) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Rol no encontrado'
                });
            }

            // Actualizar rol
            db.run(
                'UPDATE roles SET nombre = ?, descripcion = ?, permisos = ?, salario_base = ? WHERE id = ?',
                [nombre, descripcion, permisos, salario_base, id],
                function(err) {
                    if (err) {
                        db.close();
                        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                            return res.status(400).json({
                                success: false,
                                message: 'Ya existe un rol con ese nombre'
                            });
                        }
                        return res.status(500).json({
                            success: false,
                            message: 'Error al actualizar rol'
                        });
                    }

                    // Obtener rol actualizado
                    db.get(
                        'SELECT * FROM roles WHERE id = ?',
                        [id],
                        (err, rol) => {
                            db.close();
                            
                            if (err) {
                                return res.status(500).json({
                                    success: false,
                                    message: 'Rol actualizado pero error al obtener datos'
                                });
                            }

                            res.json({
                                success: true,
                                message: 'Rol actualizado exitosamente',
                                data: rol
                            });
                        }
                    );
                }
            );
        }
    );
});

// Eliminar rol (solo admin)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si hay empleados usando este rol
    db.get(
        'SELECT COUNT(*) as count FROM empleados WHERE rol_id = ? AND activo = 1',
        [id],
        (err, result) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error al verificar empleados'
                });
            }

            if (result.count > 0) {
                db.close();
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el rol porque hay empleados asignados a él'
                });
            }

            // Eliminar rol
            db.run(
                'DELETE FROM roles WHERE id = ?',
                [id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Error al eliminar rol'
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'Rol no encontrado'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Rol eliminado exitosamente'
                    });
                }
            );
        }
    );
});

// Obtener empleados por rol
router.get('/:id/empleados', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    db.all(
        `SELECT e.id, e.nombre, e.apellido, e.email, e.activo, e.fecha_contratacion
         FROM empleados e 
         WHERE e.rol_id = ? 
         ORDER BY e.nombre, e.apellido`,
        [id],
        (err, empleados) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener empleados del rol'
                });
            }

            res.json({
                success: true,
                data: empleados
            });
        }
    );
});

module.exports = router;
