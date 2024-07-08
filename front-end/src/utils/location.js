function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
  }
  
  function transformLat(x, y) {
    return -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y +
      0.2 * Math.sqrt(Math.abs(x)) +
      (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3 +
      (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3 +
      (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3
  }
  
  function transformLng(x, y) {
    return 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y +
      0.1 * Math.sqrt(Math.abs(x)) +
      (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3 +
      (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3 +
      (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3
  }
  
  function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat]
  
    const a = 6378245.0
    const ee = 0.00669342162296594323
    const dLat = transformLat(lng - 105.0, lat - 35.0)
    const dLng = transformLng(lng - 105.0, lat - 35.0)
    const radLat = lat / 180.0 * Math.PI
    const magic = Math.sin(radLat)
    const sqrtMagic = Math.sqrt(1 - ee * magic * magic)
    const mgLat = lat + (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
    const mgLng = lng + (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
    return [mgLng, mgLat]
  }

//   https://nominatim.openstreetmap.org/reverse?lat=40.03326061109028&lon=116.40684219057711