let url = $request.url;
let match = url.match(/coolapk\.com\/link.*[?&]url=([^&]+)/);

if (match) {
  $done({
    response: {
      status: 302,
      headers: {
        "Location": decodeURIComponent(match[1]),
        "Cache-Control": "no-cache"
      }
    }
  });
} else {
  $done({});
}
