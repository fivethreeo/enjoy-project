export function pluginDjangoReload() {
  return {
    name: 'django-dev-reload',
    setup(api) {
      const pid = Number(process.env.DJANGO_PID);
      if (process.platform === 'win32' || !Number.isSafeInteger(pid) || pid <= 1) return;
      let timer;
      api.onAfterDevCompile(({ isFirstCompile, stats }) => {
        clearTimeout(timer);
        if (isFirstCompile || stats.hasErrors()) return;
        timer = setTimeout(() => {
          try {
            process.kill(pid, 'SIGHUP');
            console.log('Requested Django reload after frontend rebuild.');
          } catch (error) {
            console.warn(`Could not signal Django PID ${pid}: ${error.message}`);
          }
        }, 100);
        timer.unref();
      });
      api.onCloseDevServer(() => clearTimeout(timer));
    },
  };
}
