const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

const db = new sqlite3.Database(dbPath);

// Definir los nuevos roles y sus horarios
const roles = [
    {
        nombre: 'centralista',
        descripcion: 'Centralista - Turno Mañana: Lun-Dom (07:00-16:00), 5 días trabajo, 2 descanso',
        permisos: 'centralista'
    },
    {
        nombre: 'despachador',
        descripcion: 'Despachador - Turno Mañana: Lun-Sáb (07:00-15:00), 6 días trabajo, 1 descanso',
        permisos: 'despachador'
    },
    {
        nombre: 'part time',
        descripcion: 'Part Time - Horarios específicos según necesidad',
        permisos: 'part_time'
    },
    {
        nombre: 'supervisor',
        descripcion: 'Supervisor - Supervisión de operaciones',
        permisos: 'supervisor'
    },
    {
        nombre: 'coordinador',
        descripcion: 'Coordinador - Coordinación de equipos',
        permisos: 'coordinador'
    },
    {
        nombre: 'administrador',
        descripcion: 'Administrador - Administración del sistema',
        permisos: 'admin'
    }
];

// Definir horarios de trabajo
const horarios = [
    // Centralista Turno Mañana
    {
        nombre: 'Centralista Turno Mañana',
        hora_entrada: '07:00',
        hora_salida: '16:00',
        dias_semana: '1,2,3,4,5,6,0', // Lunes a Domingo
        descripcion: 'Centralista - Turno Mañana: 5 días trabajo, 2 descanso',
        activo: 1
    },
    // Centralista Turno Tarde
    {
        nombre: 'Centralista Turno Tarde',
        hora_entrada: '14:30',
        hora_salida: '23:30',
        dias_semana: '1,2,3,4,5,6', // Lunes a Sábado
        descripcion: 'Centralista - Turno Tarde: 4 días trabajo, 2 descanso',
        activo: 1
    },
    // Despachador Turno Mañana
    {
        nombre: 'Despachador Turno Mañana',
        hora_entrada: '07:00',
        hora_salida: '15:00',
        dias_semana: '1,2,3,4,5,6', // Lunes a Sábado
        descripcion: 'Despachador - Turno Mañana: 6 días trabajo, 1 descanso',
        activo: 1
    },
    // Despachador Turno Tarde
    {
        nombre: 'Despachador Turno Tarde',
        hora_entrada: '15:00',
        hora_salida: '23:00',
        dias_semana: '1,2,3,4,5,6', // Lunes a Sábado
        descripcion: 'Despachador - Turno Tarde: 6 días trabajo, 1 descanso',
        activo: 1
    },
    // Turno Noche
    {
        nombre: 'Turno Noche',
        hora_entrada: '23:30',
        hora_salida: '07:00',
        dias_semana: '0,1,2,3,4,5,6', // Domingo a Sábado (24/7)
        descripcion: 'Turno Noche: Domingo 23:30 - Sábado 07:00, luego rota a Centralista',
        activo: 1
    },
    // Part Time
    {
        nombre: 'Part Time Sábado Noche',
        hora_entrada: '23:30',
        hora_salida: '07:00',
        dias_semana: '6', // Solo Sábado
        descripcion: 'Part Time - Sábado Noche',
        activo: 1
    },
    {
        nombre: 'Part Time Domingo Tarde',
        hora_entrada: '15:00',
        hora_salida: '23:00',
        dias_semana: '0', // Solo Domingo
        descripcion: 'Part Time - Domingo Tarde',
        activo: 1
    }
];

async function updateRolesSystem() {
    console.log('🔄 Actualizando sistema de roles...');
    
    try {
        // Limpiar roles existentes
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM roles', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Roles existentes eliminados');

        // Insertar nuevos roles
        for (const role of roles) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO roles (nombre, descripcion, permisos) VALUES (?, ?, ?)',
                    [role.nombre, role.descripcion, role.permisos],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            console.log(`✅ Rol '${role.nombre}' creado`);
        }

        // Limpiar horarios existentes
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM horarios', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Horarios existentes eliminados');

        // Insertar nuevos horarios
        for (const horario of horarios) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO horarios (nombre, hora_entrada, hora_salida, dias_semana, descripcion, activo) VALUES (?, ?, ?, ?, ?, ?)',
                    [horario.nombre, horario.hora_entrada, horario.hora_salida, horario.dias_semana, horario.descripcion, horario.activo],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            console.log(`✅ Horario '${horario.nombre}' creado`);
        }

        console.log('🎉 Sistema de roles actualizado exitosamente!');
        
    } catch (error) {
        console.error('❌ Error al actualizar sistema de roles:', error);
    } finally {
        db.close();
    }
}

// Ejecutar actualización
updateRolesSystem();
