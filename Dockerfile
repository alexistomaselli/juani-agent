FROM node:23-slim

WORKDIR /app

# Copiar archivos de definición de paquetes
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Construir el proyecto
RUN npm run build

# Exponer el puerto
EXPOSE 3001

# Comando para arrancar
CMD ["node", "dist/index.js"]
