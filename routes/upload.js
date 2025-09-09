const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { authenticateToken } = require('./auth');

const router = express.Router();

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único para el archivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `profile-${req.user.id}-${uniqueSuffix}${ext}`);
    }
});

// Filtro para validar tipos de archivo
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos de imagen (JPEG, JPG, PNG, GIF, WEBP)'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    },
    fileFilter: fileFilter
});

// Endpoint para subir foto de perfil
router.post('/profile-photo', authenticateToken, upload.single('profilePhoto'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se ha seleccionado ningún archivo' 
            });
        }

        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        // Eliminar foto anterior si existe
        db.get('SELECT foto FROM empleados WHERE id = ?', [req.user.id], (err, row) => {
            if (err) {
                console.error('Error al obtener foto anterior:', err);
            } else if (row && row.foto) {
                const oldPhotoPath = path.join(__dirname, '..', 'public', 'uploads', 'profiles', path.basename(row.foto));
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath);
                }
            }
        });

        // Actualizar la base de datos con la nueva foto
        const photoPath = `/uploads/profiles/${req.file.filename}`;
        db.run(
            'UPDATE empleados SET foto = ? WHERE id = ?',
            [photoPath, req.user.id],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error al actualizar foto en la base de datos:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error al guardar la foto en la base de datos' 
                    });
                }

                res.json({
                    success: true,
                    message: 'Foto de perfil actualizada correctamente',
                    photoPath: photoPath
                });
            }
        );

    } catch (error) {
        console.error('Error al subir foto de perfil:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para eliminar foto de perfil
router.delete('/profile-photo', authenticateToken, (req, res) => {
    try {
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        // Obtener la foto actual
        db.get('SELECT foto FROM empleados WHERE id = ?', [req.user.id], (err, row) => {
            if (err) {
                db.close();
                console.error('Error al obtener foto actual:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al obtener la foto actual' 
                });
            }

            if (row && row.foto) {
                // Eliminar archivo físico
                const photoPath = path.join(__dirname, '..', 'public', 'uploads', 'profiles', path.basename(row.foto));
                if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath);
                }
            }

            // Actualizar la base de datos
            db.run(
                'UPDATE empleados SET foto = NULL WHERE id = ?',
                [req.user.id],
                function(err) {
                    db.close();
                    
                    if (err) {
                        console.error('Error al eliminar foto de la base de datos:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Error al eliminar la foto de la base de datos' 
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Foto de perfil eliminada correctamente'
                    });
                }
            );
        });

    } catch (error) {
        console.error('Error al eliminar foto de perfil:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Endpoint para obtener foto de perfil
router.get('/profile-photo/:employeeId?', authenticateToken, (req, res) => {
    try {
        const employeeId = req.params.employeeId || req.user.id;
        const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'asistencia.db'));
        
        db.get('SELECT foto FROM empleados WHERE id = ?', [employeeId], (err, row) => {
            db.close();
            
            if (err) {
                console.error('Error al obtener foto de perfil:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al obtener la foto de perfil' 
                });
            }

            if (row && row.foto) {
                res.json({
                    success: true,
                    photoPath: row.foto
                });
            } else {
                res.json({
                    success: true,
                    photoPath: null
                });
            }
        });

    } catch (error) {
        console.error('Error al obtener foto de perfil:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

module.exports = router;
