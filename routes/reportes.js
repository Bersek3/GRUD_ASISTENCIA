const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Generar reporte de asistencia
router.get('/asistencia', authenticateToken, requireAdmin, (req, res) => {
    const { fecha_inicio, fecha_fin, empleado_id, formato = 'json' } = req.query;
    
    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de inicio y fin son requeridas'
        });
    }

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT a.*, e.nombre, e.apellido, e.email, r.nombre as rol_nombre
        FROM asistencia a
        INNER JOIN empleados e ON a.empleado_id = e.id
        LEFT JOIN roles r ON e.rol_id = r.id
        WHERE a.fecha BETWEEN ? AND ?
    `;
    let params = [fecha_inicio, fecha_fin];

    if (empleado_id) {
        query += ' AND a.empleado_id = ?';
        params.push(empleado_id);
    }

    query += ' ORDER BY a.fecha DESC, e.nombre, e.apellido';

    db.all(query, params, (err, asistencias) => {
        if (err) {
            db.close();
            return res.status(500).json({
                success: false,
                message: 'Error al generar reporte de asistencia'
            });
        }

        // Calcular estadísticas
        const estadisticas = calcularEstadisticasReporte(asistencias);

        // Guardar reporte en la base de datos
        const reporteData = {
            asistencias,
            estadisticas,
            parametros: { fecha_inicio, fecha_fin, empleado_id }
        };

        db.run(
            'INSERT INTO reportes (empleado_id, tipo_reporte, fecha_inicio, fecha_fin, datos) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'asistencia', fecha_inicio, fecha_fin, JSON.stringify(reporteData)],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error al guardar reporte:', err);
                }

                res.json({
                    success: true,
                    data: {
                        reporte_id: this.lastID,
                        asistencias,
                        estadisticas,
                        total_registros: asistencias.length
                    }
                });
            }
        );
    });
});

// Generar reporte de vacaciones
router.get('/vacaciones', authenticateToken, requireAdmin, (req, res) => {
    const { fecha_inicio, fecha_fin, empleado_id, estado } = req.query;
    
    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de inicio y fin son requeridas'
        });
    }

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT v.*, e.nombre, e.apellido, e.email, 
               e_aprobador.nombre as aprobador_nombre, e_aprobador.apellido as aprobador_apellido
        FROM vacaciones v
        INNER JOIN empleados e ON v.empleado_id = e.id
        LEFT JOIN empleados e_aprobador ON v.aprobado_por = e_aprobador.id
        WHERE v.fecha_inicio BETWEEN ? AND ?
    `;
    let params = [fecha_inicio, fecha_fin];

    if (empleado_id) {
        query += ' AND v.empleado_id = ?';
        params.push(empleado_id);
    }

    if (estado) {
        query += ' AND v.estado = ?';
        params.push(estado);
    }

    query += ' ORDER BY v.fecha_inicio DESC, e.nombre, e.apellido';

    db.all(query, params, (err, vacaciones) => {
        if (err) {
            db.close();
            return res.status(500).json({
                success: false,
                message: 'Error al generar reporte de vacaciones'
            });
        }

        // Calcular estadísticas
        const estadisticas = calcularEstadisticasVacaciones(vacaciones);

        // Guardar reporte
        const reporteData = {
            vacaciones,
            estadisticas,
            parametros: { fecha_inicio, fecha_fin, empleado_id, estado }
        };

        db.run(
            'INSERT INTO reportes (empleado_id, tipo_reporte, fecha_inicio, fecha_fin, datos) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'vacaciones', fecha_inicio, fecha_fin, JSON.stringify(reporteData)],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error al guardar reporte:', err);
                }

                res.json({
                    success: true,
                    data: {
                        reporte_id: this.lastID,
                        vacaciones,
                        estadisticas,
                        total_registros: vacaciones.length
                    }
                });
            }
        );
    });
});

// Generar reporte de horas trabajadas
router.get('/horas-trabajadas', authenticateToken, requireAdmin, (req, res) => {
    const { fecha_inicio, fecha_fin, empleado_id } = req.query;
    
    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de inicio y fin son requeridas'
        });
    }

    const db = new sqlite3.Database(dbPath);

    let query = `
        SELECT e.id, e.nombre, e.apellido, e.email, r.nombre as rol_nombre,
               COUNT(a.id) as dias_trabajados,
               SUM(a.horas_trabajadas) as total_horas,
               AVG(a.horas_trabajadas) as promedio_horas,
               MIN(a.hora_entrada) as hora_entrada_mas_temprana,
               MAX(a.hora_entrada) as hora_entrada_mas_tarde
        FROM empleados e
        LEFT JOIN asistencia a ON e.id = a.empleado_id AND a.fecha BETWEEN ? AND ? AND a.horas_trabajadas IS NOT NULL
        LEFT JOIN roles r ON e.rol_id = r.id
        WHERE e.activo = 1
    `;
    let params = [fecha_inicio, fecha_fin];

    if (empleado_id) {
        query += ' AND e.id = ?';
        params.push(empleado_id);
    }

    query += ' GROUP BY e.id ORDER BY total_horas DESC';

    db.all(query, params, (err, reporte) => {
        if (err) {
            db.close();
            return res.status(500).json({
                success: false,
                message: 'Error al generar reporte de horas trabajadas'
            });
        }

        // Calcular estadísticas generales
        const estadisticas = calcularEstadisticasHoras(reporte);

        // Guardar reporte
        const reporteData = {
            empleados: reporte,
            estadisticas,
            parametros: { fecha_inicio, fecha_fin, empleado_id }
        };

        db.run(
            'INSERT INTO reportes (empleado_id, tipo_reporte, fecha_inicio, fecha_fin, datos) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'horas_trabajadas', fecha_inicio, fecha_fin, JSON.stringify(reporteData)],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error al guardar reporte:', err);
                }

                res.json({
                    success: true,
                    data: {
                        reporte_id: this.lastID,
                        empleados: reporte,
                        estadisticas,
                        total_empleados: reporte.length
                    }
                });
            }
        );
    });
});

// Obtener historial de reportes generados
router.get('/historial', authenticateToken, requireAdmin, (req, res) => {
    const { limite = 20 } = req.query;
    const db = new sqlite3.Database(dbPath);

    db.all(
        `SELECT r.*, e.nombre, e.apellido
         FROM reportes r
         INNER JOIN empleados e ON r.empleado_id = e.id
         ORDER BY r.created_at DESC
         LIMIT ?`,
        [parseInt(limite)],
        (err, reportes) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener historial de reportes'
                });
            }

            res.json({
                success: true,
                data: reportes
            });
        }
    );
});

// Obtener reporte específico
router.get('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    db.get(
        `SELECT r.*, e.nombre, e.apellido
         FROM reportes r
         INNER JOIN empleados e ON r.empleado_id = e.id
         WHERE r.id = ?`,
        [id],
        (err, reporte) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener reporte'
                });
            }

            if (!reporte) {
                return res.status(404).json({
                    success: false,
                    message: 'Reporte no encontrado'
                });
            }

            // Parsear datos del reporte
            try {
                reporte.datos = JSON.parse(reporte.datos);
            } catch (e) {
                reporte.datos = {};
            }

            res.json({
                success: true,
                data: reporte
            });
        }
    );
});

// Función auxiliar para calcular estadísticas de asistencia
function calcularEstadisticasReporte(asistencias) {
    const totalRegistros = asistencias.length;
    const presentes = asistencias.filter(a => a.estado === 'presente').length;
    const ausentes = asistencias.filter(a => a.estado === 'ausente').length;
    const totalHoras = asistencias.reduce((sum, a) => sum + (a.horas_trabajadas || 0), 0);
    const empleadosUnicos = new Set(asistencias.map(a => a.empleado_id)).size;

    return {
        total_registros: totalRegistros,
        presentes,
        ausentes,
        total_horas: Math.round(totalHoras * 100) / 100,
        empleados_unicos: empleadosUnicos,
        porcentaje_asistencia: totalRegistros > 0 ? Math.round((presentes / totalRegistros) * 100) : 0
    };
}

// Función auxiliar para calcular estadísticas de vacaciones
function calcularEstadisticasVacaciones(vacaciones) {
    const totalSolicitudes = vacaciones.length;
    const aprobadas = vacaciones.filter(v => v.estado === 'aprobado').length;
    const pendientes = vacaciones.filter(v => v.estado === 'pendiente').length;
    const rechazadas = vacaciones.filter(v => v.estado === 'rechazado').length;
    const totalDias = vacaciones.reduce((sum, v) => sum + v.dias_solicitados, 0);
    const empleadosUnicos = new Set(vacaciones.map(v => v.empleado_id)).size;

    return {
        total_solicitudes: totalSolicitudes,
        aprobadas,
        pendientes,
        rechazadas,
        total_dias: totalDias,
        empleados_unicos: empleadosUnicos,
        promedio_dias: totalSolicitudes > 0 ? Math.round((totalDias / totalSolicitudes) * 100) / 100 : 0
    };
}

// Función auxiliar para calcular estadísticas de horas trabajadas
function calcularEstadisticasHoras(empleados) {
    const empleadosConHoras = empleados.filter(e => e.total_horas > 0);
    const totalHoras = empleados.reduce((sum, e) => sum + (e.total_horas || 0), 0);
    const promedioHoras = empleadosConHoras.length > 0 ? totalHoras / empleadosConHoras.length : 0;
    const maxHoras = Math.max(...empleados.map(e => e.total_horas || 0));
    const minHoras = Math.min(...empleadosConHoras.map(e => e.total_horas || 0));

    return {
        total_empleados: empleados.length,
        empleados_con_horas: empleadosConHoras.length,
        total_horas: Math.round(totalHoras * 100) / 100,
        promedio_horas: Math.round(promedioHoras * 100) / 100,
        max_horas: Math.round(maxHoras * 100) / 100,
        min_horas: Math.round(minHoras * 100) / 100
    };
}

module.exports = router;
