# 使用 Node.js 18 Alpine 镜像（轻量、安全）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置时区环境变量（可选，但推荐）
ENV TZ=Asia/Shanghai

# 安装 tzdata 以支持时区设置
RUN apk add --no-cache tzdata

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源码
COPY . .

# 暴露端口（默认 3000）
EXPOSE 3000

# 启动命令（使用 npm start，对应 package.json 中的脚本）
CMD ["npm", "start"]