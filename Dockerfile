# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 启用Corepack并设置Yarn版本
RUN corepack enable && corepack prepare yarn@3.6.1 --activate

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 复制压缩的node_modules和其他必要文件
COPY node_modules.tar.gz ./
COPY .next ./.next
COPY package.json ./
COPY public ./public

# 解压node_modules并删除压缩包
RUN tar -xzf node_modules.tar.gz && rm node_modules.tar.gz

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 设置权限
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动应用（使用npm避免Yarn版本问题
CMD ["npm", "run", "serve"]
