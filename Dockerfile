FROM node:20-slim

WORKDIR /app

# Instalar dependencias de sistema si fuera necesario
# RUN apt-get update && apt-get install -y openssl

# Copiar archivos de definición de paquetes
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Construir el proyecto (compilar TypeScript a JavaScript)
RUN npm run build

# Exponer el puerto
EXPOSE 3001

# Comando para arrancar la aplicación usando el código compilado
CMD ["npm", "start"]
