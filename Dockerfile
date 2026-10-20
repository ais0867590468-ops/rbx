FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV APP_MODE=admin
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080

RUN npm run build:admin

EXPOSE 8080

CMD ["npm", "run", "start:admin"]
