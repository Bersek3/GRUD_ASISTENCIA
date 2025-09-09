const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();

// Configuración de multer para subir liquidaciones
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'payrolls');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único para el archivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `payroll-${req.body.empleado_id}-${req.body.periodo_ano}-${req.body.periodo_mes}-${uniqueSuffix}${ext}`);
    }
});

// Filtro para validar tipos de archivo
const fileFilter = (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype === 'application/pdf' ||
                    file.mimetype === 'application/msword' ||
                    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                    file.mimetype === 'application/vnd.ms-excel' ||
                    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos PDF, DOC, DOCX, XLS, XLSX'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB máximo
    },
    fileFilter: fileFilter
});

// Endpoint para subir liquidación de sueldo (solo administradores)
router.post('/upload', authenticateToken, requireAdmin, upload.single('liquidacion'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se ha seleccionado ningún archivo' 
            });
        }

        const { empleado_id, periodo_mes, periodo_ano, observaciones } = req.body;

        if (!empleado_id || !periodo_mes || !periodo_ano) {
            // Eliminar archivo si faltan datos requeridos
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan datos requeridos: empleado, mes y año' 
            });
        }

        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        // Verificar que el empleado existe
        db.get('SELECT id FROM empleados WHERE id = ? AND activo = 1', [empleado_id], (err, row) => {
            if (err) {
                db.close();
                fs.unlinkSync(req.file.path);
                console.error('Error al verificar empleado:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al verificar empleado' 
                });
            }

            if (!row) {
                db.close();
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Empleado no encontrado o inactivo' 
                });
            }

            // Verificar si ya existe una liquidación para este período
            db.get('SELECT id FROM liquidaciones WHERE empleado_id = ? AND periodo_mes = ? AND periodo_ano = ? AND activo = 1', 
                [empleado_id, periodo_mes, periodo_ano], (err, existingRow) => {
                
                if (err) {
                    db.close();
                    fs.unlinkSync(req.file.path);
                    console.error('Error al verificar liquidación existente:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al verificar liquidación existente' 
                    });
                }

                if (existingRow) {
                    db.close();
                    fs.unlinkSync(req.file.path);
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Ya existe una liquidación para este empleado en el período especificado' 
                    });
                }

                // Insertar nueva liquidación
                const archivoPath = `/uploads/payrolls/${req.file.filename}`;
                db.run(
                    `INSERT INTO liquidaciones 
                     (empleado_id, periodo_mes, periodo_ano, archivo_path, nombre_archivo, tipo_archivo, tamaño_archivo, subido_por, observaciones) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [empleado_id, periodo_mes, periodo_ano, archivoPath, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, observaciones || null],
                    function(err) {
                        db.close();
                        
                        if (err) {
                            console.error('Error al insertar liquidación:', err);
                            fs.unlinkSync(req.file.path);
                            return res.status(500).json({ 
                                success: false, 
                                message: 'Error al guardar la liquidación en la base de datos' 
                            });
                        }

                        res.json({
                            success: true,
                            message: 'Liquidación subida correctamente',
                            liquidacion: {
                                id: this.lastID,
                                archivo_path: archivoPath,
                                nombre_archivo: req.file.originalname
                            }
                        });
                    }
                );
            });
        });

    } catch (error) {
        console.error('Error al subir liquidación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para obtener liquidaciones de un empleado
router.get('/empleado/:empleadoId', authenticateToken, (req, res) => {
    try {
        const empleadoId = req.params.empleadoId;
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        // Verificar permisos: solo el empleado puede ver sus liquidaciones o un admin
        if (req.user.rol !== 'admin' && req.user.id != empleadoId) {
            db.close();
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver estas liquidaciones' 
            });
        }

        db.all(
            `SELECT l.*, e.nombre, e.apellido 
             FROM liquidaciones l 
             JOIN empleados e ON l.empleado_id = e.id 
             WHERE l.empleado_id = ? AND l.activo = 1 
             ORDER BY l.periodo_ano DESC, l.periodo_mes DESC`,
            [empleadoId],
            (err, rows) => {
                db.close();
                
                if (err) {
                    console.error('Error al obtener liquidaciones:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al obtener liquidaciones' 
                    });
                }

                res.json({
                    success: true,
                    liquidaciones: rows
                });
            }
        );

    } catch (error) {
        console.error('Error al obtener liquidaciones:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para obtener todas las liquidaciones (solo administradores)
router.get('/all', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        db.all(
            `SELECT l.*, e.nombre, e.apellido, e.email,
                    s.nombre as subido_por_nombre, s.apellido as subido_por_apellido
             FROM liquidaciones l 
             JOIN empleados e ON l.empleado_id = e.id 
             LEFT JOIN empleados s ON l.subido_por = s.id
             WHERE l.activo = 1 
             ORDER BY l.periodo_ano DESC, l.periodo_mes DESC, e.apellido ASC`,
            [],
            (err, rows) => {
                db.close();
                
                if (err) {
                    console.error('Error al obtener todas las liquidaciones:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al obtener liquidaciones' 
                    });
                }

                res.json({
                    success: true,
                    liquidaciones: rows
                });
            }
        );

    } catch (error) {
        console.error('Error al obtener todas las liquidaciones:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para eliminar liquidación (solo administradores)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const liquidacionId = req.params.id;
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        // Obtener información de la liquidación antes de eliminar
        db.get('SELECT archivo_path FROM liquidaciones WHERE id = ?', [liquidacionId], (err, row) => {
            if (err) {
                db.close();
                console.error('Error al obtener liquidación:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al obtener liquidación' 
                });
            }

            if (!row) {
                db.close();
                return res.status(404).json({ 
                    success: false, 
                    message: 'Liquidación no encontrada' 
                });
            }

            // Eliminar archivo físico
            const filePath = path.join(__dirname, '..', 'public', 'uploads', 'payrolls', path.basename(row.archivo_path));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Marcar como inactivo en la base de datos
            db.run('UPDATE liquidaciones SET activo = 0 WHERE id = ?', [liquidacionId], function(err) {
                db.close();
                
                if (err) {
                    console.error('Error al eliminar liquidación:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al eliminar liquidación' 
                    });
                }

                res.json({
                    success: true,
                    message: 'Liquidación eliminada correctamente'
                });
            });
        });

    } catch (error) {
        console.error('Error al eliminar liquidación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para descargar liquidación
router.get('/download/:id', authenticateToken, (req, res) => {
    try {
        const liquidacionId = req.params.id;
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        db.get(
            'SELECT l.*, e.nombre, e.apellido FROM liquidaciones l JOIN empleados e ON l.empleado_id = e.id WHERE l.id = ? AND l.activo = 1',
            [liquidacionId],
            (err, row) => {
                db.close();
                
                if (err) {
                    console.error('Error al obtener liquidación:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al obtener liquidación' 
                    });
                }

                if (!row) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'Liquidación no encontrada' 
                    });
                }

                // Verificar permisos: solo el empleado puede descargar su liquidación o un admin
                if (req.user.rol !== 'admin' && req.user.id != row.empleado_id) {
                    return res.status(403).json({ 
                        success: false, 
                        message: 'No tienes permisos para descargar esta liquidación' 
                    });
                }

                const filePath = path.join(__dirname, '..', 'public', 'uploads', 'payrolls', path.basename(row.archivo_path));
                
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'Archivo no encontrado' 
                    });
                }

                res.download(filePath, row.nombre_archivo);
            }
        );

    } catch (error) {
        console.error('Error al descargar liquidación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

module.exports = router;
