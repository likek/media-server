function pathNormalizer(req, res, next) {
    const originalSend = res.send;
    res.send = function (body) {
      if (typeof body === "object") {
        const normalizePaths = (obj) => {
          if (Array.isArray(obj)) {
            return obj.map(normalizePaths);
          } else if (obj !== null && typeof obj === "object") {
            for (let key in obj) {
              if (typeof obj[key] === "string") {
                obj[key] = obj[key].replace(/\\/g, "/");
              } else if (typeof obj[key] === "object") {
                obj[key] = normalizePaths(obj[key]);
              }
            }
            return obj;
          }
          return obj;
        };
        body = normalizePaths(body);
      }
      return originalSend.call(this, body);
    };
    next();
  }

  export {
    pathNormalizer
  }