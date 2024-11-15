module.exports = {
  apps: [
    {
      name: "cab-driver-app",
      script: "index.js",
      args: "",
      instances: 1,
      exec_mode: "fork",
      node_args:
        "--max-old-space-size=2048 --trace-gc --optimize_for_size --gc_interval=100",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
