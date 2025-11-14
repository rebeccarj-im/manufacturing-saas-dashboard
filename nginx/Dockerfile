FROM nginx:alpine

# Use our custom nginx config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy prebuilt frontend files (dist) into nginx html root
COPY frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
