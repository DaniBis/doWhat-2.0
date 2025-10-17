const MAPBOX_HTML_TEMPLATE = (token: string, styleUrl: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #f8fafc; }
      #map { position: absolute; top: 0; bottom: 0; width: 100%; }
      .marker { background: #16B3A3; border-radius: 9999px; width: 20px; height: 20px; border: 3px solid #fff; }
      .mapboxgl-popup { max-width: 260px; font: 14px/1.4 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .mapboxgl-popup-content { border-radius: 14px; padding: 12px 14px; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18); }
      .mapboxgl-control-container { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
    <script>
      (function() {
        const accessToken = ${JSON.stringify(token)};
        if (!accessToken) {
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#b91c1c;font-family:Inter,system-ui,sans-serif;text-align:center;padding:32px;">Mapbox access token missing.</div>';
          return;
        }

        mapboxgl.accessToken = accessToken;
        const map = new mapboxgl.Map({
          container: 'map',
          style: ${JSON.stringify(styleUrl)},
          center: [0, 0],
          zoom: 11,
          cooperativeGestures: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        let mapReady = false;
        let pendingState = null;
        let selectedId = null;

        const RN = window.ReactNativeWebView;

        const toRad = (deg) => (deg * Math.PI) / 180;
        const haversine = (lat1, lng1, lat2, lng2) => {
          const R = 6371000;
          const dLat = toRad(lat2 - lat1);
          const dLng = toRad(lng2 - lng1);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        const send = (message) => {
          if (!RN || !message) return;
          try {
            RN.postMessage(JSON.stringify(message));
          } catch (error) {
            console.error('postMessage error', error);
          }
        };

        const applySelectedFilter = () => {
          const layerId = 'selected-point';
          if (!map.getLayer(layerId)) return;
          if (selectedId) {
            map.setFilter(layerId, ['all', ['!has', 'point_count'], ['==', ['get', 'id'], selectedId]]);
          } else {
            map.setFilter(layerId, ['all', ['==', ['get', 'id'], '___']]);
          }
        };

        const updateData = (state) => {
          if (!state) return;
          const source = map.getSource('activities');
          if (source) {
            source.setData(state.featureCollection ?? { type: 'FeatureCollection', features: [] });
          }
          if (state.center && state.recenter) {
            map.easeTo({ center: [state.center.lng, state.center.lat], zoom: state.zoom ?? map.getZoom(), duration: state.animate ? 600 : 0 });
          }
          selectedId = state.selectedActivityId || null;
          applySelectedFilter();
        };

        map.on('load', () => {
          map.addSource('activities', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 16,
            clusterRadius: 48,
          });

          map.addLayer({
            id: 'activity-clusters',
            type: 'circle',
            source: 'activities',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': ['step', ['get', 'point_count'], '#16B3A3', 10, '#FDB515', 30, '#EF4444'],
              'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });

          map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'activities',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-font': ['Inter Semi Bold', 'Arial Unicode MS Bold'],
              'text-size': 12,
            },
            paint: {
              'text-color': '#0f172a',
            },
          });

          map.addLayer({
            id: 'activity-points',
            type: 'circle',
            source: 'activities',
            filter: ['!has', 'point_count'],
            paint: {
              'circle-color': '#16B3A3',
              'circle-radius': 10,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          });

          map.addLayer({
            id: 'selected-point',
            type: 'circle',
            source: 'activities',
            filter: ['all', ['==', ['get', 'id'], '___']],
            paint: {
              'circle-color': '#ffffff',
              'circle-radius': 16,
              'circle-stroke-color': '#16B3A3',
              'circle-stroke-width': 4,
            },
          });

          map.on('click', 'activity-clusters', (event) => {
            const features = map.queryRenderedFeatures(event.point, { layers: ['activity-clusters'] });
            const feature = features && features[0];
            if (!feature) return;
            const clusterId = feature.properties && feature.properties.cluster_id;
            const source = map.getSource('activities');
            if (!source || !clusterId) return;
            source.getClusterExpansionZoom(clusterId, (error, zoom) => {
              if (error) return;
              const [lng, lat] = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [event.lngLat.lng, event.lngLat.lat];
              map.easeTo({ center: [lng, lat], zoom: zoom + 0.5 });
            });
          });

          map.on('click', 'activity-points', (event) => {
            const features = map.queryRenderedFeatures(event.point, { layers: ['activity-points'] });
            const feature = features && features[0];
            if (!feature || !feature.properties) return;
            const id = feature.properties.id;
            if (id) {
              selectedId = id;
              applySelectedFilter();
              send({ type: 'select', activityId: String(id) });
            }
          });

          map.on('moveend', () => {
            const center = map.getCenter();
            const bounds = map.getBounds();
            const radius = Math.max(300, Math.min(30000, haversine(bounds.getNorthEast().lat, bounds.getNorthEast().lng, bounds.getSouthWest().lat, bounds.getSouthWest().lng) / 2));
            send({
              type: 'move',
              center: { lat: Number(center.lat.toFixed(6)), lng: Number(center.lng.toFixed(6)) },
              radiusMeters: radius,
            });
          });

          mapReady = true;
          if (pendingState) {
            updateData(pendingState);
            pendingState = null;
          }
          send({ type: 'ready' });
        });

        const handleMessage = (event) => {
          let data = null;
          try {
            data = JSON.parse(event.data);
          } catch (error) {
            console.error('Invalid message payload', error);
            return;
          }
          if (!data) return;
          if (data.type === 'update') {
            if (mapReady) {
              updateData(data);
            } else {
              pendingState = data;
            }
          }
        };

        window.addEventListener('message', handleMessage);
        document.addEventListener('message', handleMessage);
      })();
    </script>
  </body>
</html>`;

export const createMapboxFallbackHtml = (token: string, styleUrl: string) => MAPBOX_HTML_TEMPLATE(token, styleUrl);
