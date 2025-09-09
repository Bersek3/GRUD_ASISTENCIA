const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_muy_segura_cambiar_en_produccion';

// Middleware para verificar token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token de acceso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware para verificar permisos de administrador
const requireAdmin = (req, res, next) => {
    if (req.user.rol !== 'Administrador') {
        return res.status(403).json({ success: false, message: 'Se requieren permisos de administrador' });
    }
    next();
};

// Login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email y contraseña son requeridos'
        });
    }

    const db = new sqlite3.Database(dbPath);

    db.get(
        `SELECT e.*, r.nombre as rol_nombre, r.permisos 
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         WHERE e.email = ? AND e.activo = 1`,
        [email],
        (err, empleado) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error en la base de datos'
                });
            }

            if (!empleado) {
                db.close();
                return res.status(401).json({
                    success: false,
                    message: 'Credenciales inválidas'
                });
            }

            bcrypt.compare(password, empleado.password_hash, (err, isMatch) => {
                db.close();
                
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error al verificar contraseña'
                    });
                }

                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'Credenciales inválidas'
                    });
                }

                const token = jwt.sign(
                    {
                        id: empleado.id,
                        email: empleado.email,
                        rol: empleado.rol_nombre,
                        permisos: empleado.permisos
                    },
                    JWT_SECRET,
                    { expiresIn: '8h' }
                );

                res.json({
                    success: true,
                    message: 'Login exitoso',
                    token,
                    user: {
                        id: empleado.id,
                        nombre: empleado.nombre,
                        apellido: empleado.apellido,
                        email: empleado.email,
                        rol: empleado.rol_nombre,
                        permisos: empleado.permisos,
                        foto: empleado.foto
                    }
                });
            });
        }
    );
});

// Verificar token
router.get('/verify', authenticateToken, (req, res) => {
    const db = new sqlite3.Database(dbPath);

    db.get(
        `SELECT e.*, r.nombre as rol_nombre, r.permisos 
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         WHERE e.id = ? AND e.activo = 1`,
        [req.user.id],
        (err, empleado) => {
            db.close();
            
            if (err || !empleado) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            res.json({
                success: true,
                user: {
                    id: empleado.id,
                    nombre: empleado.nombre,
                    apellido: empleado.apellido,
                    email: empleado.email,
                    rol: empleado.rol_nombre,
                    permisos: empleado.permisos,
                    foto: empleado.foto
                }
            });
        }
    );
});

// Cambiar contraseña
router.post('/change-password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Contraseña actual y nueva contraseña son requeridas'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La nueva contraseña debe tener al menos 6 caracteres'
        });
    }

    const db = new sqlite3.Database(dbPath);

    db.get(
        'SELECT password_hash FROM empleados WHERE id = ?',
        [req.user.id],
        (err, empleado) => {
            if (err) {
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Error en la base de datos'
                });
            }

            if (!empleado) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            bcrypt.compare(currentPassword, empleado.password_hash, (err, isMatch) => {
                if (err) {
                    db.close();
                    return res.status(500).json({
                        success: false,
                        message: 'Error al verificar contraseña'
                    });
                }

                if (!isMatch) {
                    db.close();
                    return res.status(401).json({
                        success: false,
                        message: 'Contraseña actual incorrecta'
                    });
                }

                const newPasswordHash = bcrypt.hashSync(newPassword, 10);

                db.run(
                    'UPDATE empleados SET password_hash = ? WHERE id = ?',
                    [newPasswordHash, req.user.id],
                    function(err) {
                        db.close();
                        
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                message: 'Error al actualizar contraseña'
                            });
                        }

                        res.json({
                            success: true,
                            message: 'Contraseña actualizada exitosamente'
                        });
                    }
                );
            });
        }
    );
});

// Logout (opcional, ya que JWT es stateless)
router.post('/logout', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Logout exitoso'
    });
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;
