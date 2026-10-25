FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=1999
ENV HOST=0.0.0.0
COPY --chown=node:node package.json server.cjs ./
COPY --chown=node:node public ./public
USER node
EXPOSE 1999
CMD ["node", "server.cjs"]
