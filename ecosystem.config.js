module.exports = {
  apps: [
    {
      name: "cab-driver-app",
      script: "index.js",
      args: "",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=2048 --trace-gc",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
