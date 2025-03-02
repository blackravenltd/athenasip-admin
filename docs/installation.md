# AthenaSIP Admin - Installation

## Building 

AthenaSIP Admin is built with React 19. To get a production build. use the npm script:

```
npm run build
```

The application will be built into the `build/` directory. Copy these files to your webserver location, or use `serve` to launch a local temporary server:

```
npm install -g serve
serve -s build
```