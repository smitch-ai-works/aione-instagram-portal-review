
    (function () {
      var mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
      var touchSmallScreen = navigator.maxTouchPoints > 0 &&
        Math.min(window.screen.width, window.screen.height) <= 1024;
      if (mobileUserAgent || touchSmallScreen) {
        document.documentElement.classList.add('mobile-device');
      }
    })();
