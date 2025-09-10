const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta a la base de datos
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');
const db = new sqlite3.Database(dbPath);

// Configuración de horarios base (distribución específica por roles)
const HORARIOS_BASE = {
    // Turnos específicos por rol
    CENTRALISTA_MANANA: {
        nombre: 'Centralista Turno Mañana',
        entrada: '08:00',
        salida: '16:00',
        horas_trabajadas: 7.5, // 8h - 0.5h colación
        dias: [1, 2, 3, 4, 5, 6, 7], // Todos los días
        descripcion: 'Centralista turno mañana (08:00-16:00) - 7.5h trabajadas',
        rol_requerido: 'Centralista'
    },
    CENTRALISTA_TARDE: {
        nombre: 'Centralista Turno Tarde',
        entrada: '16:00',
        salida: '00:00',
        horas_trabajadas: 7.5,
        dias: [1, 2, 3, 4, 5, 6, 7], // Todos los días
        descripcion: 'Centralista turno tarde (16:00-00:00) - 7.5h trabajadas',
        rol_requerido: 'Centralista'
    },
    DESPACHADOR_MANANA: {
        nombre: 'Despachador Turno Mañana',
        entrada: '08:00',
        salida: '16:00',
        horas_trabajadas: 7.5,
        dias: [1, 2, 3, 4, 5, 6, 7], // Todos los días
        descripcion: 'Despachador turno mañana (08:00-16:00) - 7.5h trabajadas',
        rol_requerido: 'Despachador'
    },
    DESPACHADOR_TARDE: {
        nombre: 'Despachador Turno Tarde',
        entrada: '16:00',
        salida: '00:00',
        horas_trabajadas: 7.5,
        dias: [1, 2, 3, 4, 5, 6, 7], // Todos los días
        descripcion: 'Despachador turno tarde (16:00-00:00) - 7.5h trabajadas',
        rol_requerido: 'Despachador'
    },
    TURNO_NOCHE: {
        nombre: 'Turno Noche',
        entrada: '00:00',
        salida: '08:00',
        horas_trabajadas: 7.5,
        dias: [1, 2, 3, 4, 5, 6, 7], // Todos los días
        descripcion: 'Turno noche (00:00-08:00) - 7.5h trabajadas',
        rol_requerido: 'Turno Noche'
    }
};

// Función para obtener número de semana
function getCurrentWeek() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek);
}

// Función para crear horarios base si no existen
async function createBaseSchedules() {
    console.log('📅 Creando horarios base...');
    
    // Primero, limpiar horarios duplicados
    await new Promise((resolve, reject) => {
        db.run(`
            DELETE FROM horarios 
            WHERE nombre IN (
                'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                'Fin de Semana Mañana', 'Fin de Semana Tarde',
                'Centralista Turno Mañana', 'Centralista Turno Tarde',
                'Despachador Turno Mañana', 'Despachador Turno Tarde'
            )
        `, (err) => {
            if (err) {
                console.error('❌ Error limpiando horarios duplicados:', err);
                reject(err);
            } else {
                console.log('🧹 Horarios duplicados eliminados');
                resolve();
            }
        });
    });
    
    // Crear horarios únicos
    for (const [key, horario] of Object.entries(HORARIOS_BASE)) {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO horarios 
                 (nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    horario.nombre,
                    horario.entrada,
                    horario.salida,
                    horario.dias.join(','),
                    horario.descripcion,
                    1
                ],
                function(err) {
                    if (err) {
                        console.error(`❌ Error creando horario ${horario.nombre}:`, err);
                        reject(err);
                    } else {
                        console.log(`✅ Horario ${horario.nombre} creado`);
                        resolve();
                    }
                }
            );
        });
    }
}

// Función para obtener empleados activos
async function getActiveEmployees() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT e.id, e.nombre, e.apellido, r.nombre as rol
            FROM empleados e
            LEFT JOIN roles r ON e.rol_id = r.id
            WHERE e.activo = 1 AND e.email != 'admin@sistema.com'
            ORDER BY e.id
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Función para obtener horarios base
async function getBaseSchedules() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT id, nombre, hora_entrada, hora_salida, dias_semana
            FROM horarios
            WHERE activo = 1 AND nombre IN (
                'Centralista Turno Mañana', 'Centralista Turno Tarde',
                'Despachador Turno Mañana', 'Despachador Turno Tarde',
                'Turno Noche'
            )
            ORDER BY id
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Algoritmo de distribución específica por roles
function distributeEmployeesEquitably(empleados, horarios) {
    const distribution = [];
    const currentWeek = getCurrentWeek();
    
    console.log(`📊 Distribuyendo ${empleados.length} empleados en ${horarios.length} horarios específicos por rol`);
    
    // Separar empleados por rol
    const centralistas = empleados.filter(emp => emp.rol === 'Centralista');
    const despachadores = empleados.filter(emp => emp.rol === 'Despachador');
    const turnoNoche = empleados.filter(emp => emp.rol === 'Turno Noche');
    
    console.log(`👥 Centralistas disponibles: ${centralistas.length}`);
    console.log(`👥 Despachadores disponibles: ${despachadores.length}`);
    console.log(`👥 Turno Noche disponibles: ${turnoNoche.length}`);
    
    // Mapear horarios con sus roles requeridos
    const horariosConRoles = horarios.map(horario => {
        let rolRequerido = null;
        
        if (horario.nombre.includes('Centralista')) {
            rolRequerido = 'Centralista';
        } else if (horario.nombre.includes('Despachador')) {
            rolRequerido = 'Despachador';
        } else if (horario.nombre.includes('Turno Noche')) {
            rolRequerido = 'Turno Noche';
        }
        
        return {
            ...horario,
            rol_requerido: rolRequerido
        };
    });
    
    // Distribuir según el rol requerido por cada horario
    horariosConRoles.forEach((horario, index) => {
        let empleadosElegibles = [];
        let empleadoSeleccionado = null;
        
        // Determinar qué empleados pueden ocupar este horario
        if (horario.rol_requerido === 'Centralista') {
            empleadosElegibles = centralistas;
        } else if (horario.rol_requerido === 'Despachador') {
            empleadosElegibles = despachadores;
        } else if (horario.rol_requerido === 'Turno Noche') {
            empleadosElegibles = turnoNoche;
        }
        
        if (empleadosElegibles.length > 0) {
            // Rotar empleados basado en la semana actual
            const empleadoIndex = (currentWeek + index) % empleadosElegibles.length;
            empleadoSeleccionado = empleadosElegibles[empleadoIndex];
        }
        
        distribution.push({
            horario: horario,
            empleados: empleadoSeleccionado ? [empleadoSeleccionado] : []
        });
        
        if (empleadoSeleccionado) {
            console.log(`✅ ${empleadoSeleccionado.nombre} ${empleadoSeleccionado.apellido} (${empleadoSeleccionado.rol}) -> ${horario.nombre}`);
        } else {
            console.log(`⚠️  No hay empleados disponibles para ${horario.nombre} (requiere: ${horario.rol_requerido || 'cualquier rol'})`);
        }
    });
    
    return distribution;
}

// Función principal de rotación inteligente
async function setupSmartRotation() {
    try {
        console.log('🔄 Iniciando sistema de rotación inteligente...');
        
        // 1. Crear horarios base
        await createBaseSchedules();
        
        // 2. Obtener empleados activos
        const empleados = await getActiveEmployees();
        console.log(`👥 Empleados activos: ${empleados.length}`);
        
        if (empleados.length === 0) {
            console.log('⚠️ No hay empleados activos para asignar horarios');
            return;
        }
        
        // 3. Obtener horarios base
        const horarios = await getBaseSchedules();
        console.log(`📅 Horarios disponibles: ${horarios.length}`);
        
        // 4. Desactivar horarios actuales
        console.log('🔄 Desactivando horarios actuales...');
        await new Promise((resolve, reject) => {
            db.run('UPDATE empleado_horarios SET activo = 0', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // 5. Distribuir empleados equitativamente
        console.log('⚖️ Distribuyendo empleados equitativamente...');
        const distribution = distributeEmployeesEquitably(empleados, horarios);
        
        // 6. Asignar horarios
        const fechaInicio = new Date().toISOString().split('T')[0];
        let totalAsignaciones = 0;
        
        for (const item of distribution) {
            for (const empleado of item.empleados) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO empleado_horarios 
                         (empleado_id, horario_id, fecha_inicio, activo) 
                         VALUES (?, ?, ?, ?)`,
                        [empleado.id, item.horario.id, fechaInicio, 1],
                        (err) => {
                            if (err) {
                                console.error(`❌ Error asignando horario a ${empleado.nombre}:`, err);
                                reject(err);
                            } else {
                                console.log(`✅ ${empleado.nombre} ${empleado.apellido} -> ${item.horario.nombre}`);
                                totalAsignaciones++;
                                resolve();
                            }
                        }
                    );
                });
            }
        }
        
        console.log(`\n🎉 Rotación completada: ${totalAsignaciones} asignaciones realizadas`);
        console.log('📊 Resumen de distribución:');
        
        distribution.forEach(item => {
            console.log(`   ${item.horario.nombre}: ${item.empleados.length} empleados`);
        });
        
    } catch (error) {
        console.error('❌ Error en rotación inteligente:', error);
    } finally {
        db.close();
    }
}

// Función para mostrar estadísticas de distribución
async function showDistributionStats(db) {
    try {
        const empleados = await new Promise((resolve, reject) => {
            db.all(`
                SELECT e.id, e.nombre, e.apellido, r.nombre as rol
                FROM empleados e
                LEFT JOIN roles r ON e.rol_id = r.id
                WHERE e.activo = 1 AND e.email != 'admin@sistema.com'
                ORDER BY e.id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const horarios = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, nombre, hora_entrada, hora_salida, dias_semana
                FROM horarios
                WHERE activo = 1 AND nombre IN (
                    'Turno Mañana', 'Turno Tarde', 'Turno Noche',
                    'Fin de Semana Mañana', 'Fin de Semana Tarde'
                )
                ORDER BY id
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log('\n📊 Estadísticas de Distribución:');
        console.log(`   Total empleados: ${empleados.length}`);
        console.log(`   Total horarios: ${horarios.length}`);
        console.log(`   Promedio por horario: ${(empleados.length / horarios.length).toFixed(1)} empleados`);
        
        // Mostrar distribución por rol
        const empleadosPorRol = {};
        empleados.forEach(emp => {
            empleadosPorRol[emp.rol] = (empleadosPorRol[emp.rol] || 0) + 1;
        });
        
        console.log('\n👥 Distribución por rol:');
        Object.entries(empleadosPorRol).forEach(([rol, cantidad]) => {
            console.log(`   ${rol}: ${cantidad} empleados`);
        });
        
        db.close();
        
    } catch (error) {
        console.error('❌ Error mostrando estadísticas:', error);
        if (db) db.close();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    setupSmartRotation()
        .then(() => {
            // Crear nueva conexión para las estadísticas
            const db2 = new sqlite3.Database(dbPath);
            return showDistributionStats(db2);
        })
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = {
    setupSmartRotation,
    showDistributionStats,
    getCurrentWeek
};
