importScripts("lastro-resource-path.js?build=20260923-v2-skill-icons-1","ThreadEventHandler.js");

(() => {
  function isSharedMapData(filename) {
    return /\.(?:gat|rsw|gnd|rsm|str)$/i.test(filename)
      || /^data\/texture\/effect\//i.test(filename);
  }

  function orderResourceRoots(filename, roots) {
    if (!isSharedMapData(filename)) return roots;
    const publicRoot = roots.find((root) => /(?:^|\/)client_re\/?$/i.test(root));
    if (!publicRoot) return roots;
    return [publicRoot, ...roots.filter((root) => root !== publicRoot)];
  }

  se.getHTTP = function getLastROHTTP(filename, callback) {
    const sourcePath = filename.replace(/\\/g, "/");
    const encodedPaths = self.LastROResourcePathEncoding
      ? self.LastROResourcePathEncoding.buildResourcePathCandidates(
        sourcePath,
        se.resourcePathCharset,
        "euc-kr"
      )
      : [sourcePath.replace(/[^/]+/g, (segment) => encodeURIComponent(segment))];
    const roots = orderResourceRoots(sourcePath, [se.remoteClient].filter(Boolean));
    const candidates = roots.length
      ? roots.flatMap((root) => encodedPaths.map((path) => root + path))
      : encodedPaths.map((path) => "/client/" + path);

    if (sourcePath.match(/\.(mp3|wav)$/)) {
      callback(candidates[0]);
      return;
    }

    let attempt = 0;
    const finish = (data, error) => {
      if (data) ne.saveFile(sourcePath, data);
      callback(data, error);
    };
    const retryOrFail = () => {
      attempt++;
      if (attempt < candidates.length) {
        load();
      } else {
        callback(null, "Can't get file");
      }
    };
    const fail = () => callback(null, "Can't get file");
    const load = () => {
      const url = candidates[attempt];
      if (typeof fetch !== "undefined") {
        fetch(url).then((response) => {
          if (response.status === 404) {
            retryOrFail();
            return null;
          }
          if (!response.ok) {
            fail();
            return null;
          }
          if ((response.headers.get("content-type") || "").includes("text/html")) {
            fail();
            return null;
          }
          return response.arrayBuffer();
        }).then((data) => {
          if (data) finish(data);
        }).catch(fail);
        return;
      }

      const request = new XMLHttpRequest();
      request.open("GET", url, true);
      request.responseType = "arraybuffer";
      request.onload = () => {
        if (request.status === 200) {
          finish(request.response);
        } else if (request.status === 404) {
          retryOrFail();
        } else {
          fail();
        }
      };
      request.onerror = fail;
      request.ontimeout = fail;
      request.onabort = fail;
      try {
        request.send(null);
      } catch (_error) {
        fail();
      }
    };

    load();
  };
})();
