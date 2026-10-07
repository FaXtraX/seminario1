# Mendoza Reporta 3.0

Aplicación full-stack para un proyecto de reportes ciudadanos.

## Qué incluye

- Registro de usuarios con contraseña cifrada con bcrypt.
- Inicio y cierre de sesión.
- Sesión persistente durante la sesión del navegador.
- Navegación Inicio / Reportar / Mis reportes / Administración.
- Botón y navegación del navegador Atrás/Adelante funcionando.
- Base de datos SQLite.
- Creación de reportes.
- Hasta 5 fotos por reporte, máximo 5 MB cada una.
- Panel de administración protegido en el servidor.
- Estadísticas.
- Gestión de usuarios: activar, desactivar y eliminar.
- Gestión de reportes: ver, cambiar estado, agregar observaciones y eliminar.
- Evidencias fotográficas vinculadas al reporte.
- Protección de rutas administrativas en backend.

## Requisitos

Instalá Node.js 20 o superior.

## 1. Abrir el proyecto

Descomprimí este ZIP. Entrá a:

```text
Mendoza_Reporta_v3/build
```

Abrí una terminal dentro de esa carpeta.

## 2. Instalar dependencias

```bash
npm install
```

## 3. Iniciar

```bash
npm start
```

Después abrí:

```text
http://localhost:3000
```

## 4. Administrador inicial

La primera vez se crea automáticamente un administrador:

- Email: `admin@mendozareporta.local`
- Contraseña: `Admin123!`

Entrá desde "Iniciar sesión". Si las credenciales son correctas, la aplicación te lleva directamente a "Administración".

### Importante

Para una entrega real o publicación en Internet, cambiá estas credenciales mediante variables de entorno:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
SESSION_SECRET
```

No publiques la contraseña del administrador en el repositorio.

## 5. Cómo funciona el administrador

Una vez iniciada la sesión como administrador:

1. Entrá en **Administración**.
2. En **Reportes** vas a ver todos los reportes.
3. Podés abrir las fotos de evidencia.
4. Podés cambiar el estado:
   - Pendiente
   - En revisión
   - Resuelto
   - Rechazado
5. Podés escribir una observación para el ciudadano.
6. Podés eliminar un reporte.
7. En **Usuarios** podés activar/desactivar usuarios o eliminarlos.
8. Las operaciones administrativas están protegidas también en el servidor: no alcanza con ocultar botones en el navegador.

## 6. Si "Registrarme" no hacía nada

La versión anterior tenía problemas de navegación y manejo de errores. Esta versión:

- evita el problema del fallback de rutas de Express 5;
- muestra errores de la API;
- permite crear la cuenta y automáticamente iniciar sesión;
- lleva al usuario a "Mis reportes";
- mantiene la navegación sin recargar toda la página.

## 7. Atrás y Adelante del navegador

La navegación ahora usa `history.pushState` y escucha `popstate/hashchange`.

Por ejemplo:

```text
Inicio -> Reportar -> Mis reportes -> Atrás
```

vuelve correctamente a:

```text
Reportar
```

y el botón Inicio también funciona.

## 8. Datos

SQLite se guarda en:

```text
build/data/mendoza-reporta.db
```

Las fotos se guardan en:

```text
build/public/uploads/
```

No borres esos elementos si querés conservar los datos.

## 9. Antes de publicar en Internet

Para producción todavía conviene agregar:

- HTTPS.
- Una base de datos administrada (PostgreSQL, por ejemplo).
- Almacenamiento de imágenes tipo S3/Cloud Storage.
- Un store de sesiones persistente en lugar del store de memoria de Express.
- Variables de entorno para secretos.
- Rate limiting.
- Recuperación de contraseña por email.
- Verificación de email.
- Logs y monitoreo.
- Copias de seguridad automáticas.
- Validación más estricta de archivos.

Para un proyecto académico local, esta versión ya deja armado el flujo completo de usuario + reportes + fotos + administrador.
