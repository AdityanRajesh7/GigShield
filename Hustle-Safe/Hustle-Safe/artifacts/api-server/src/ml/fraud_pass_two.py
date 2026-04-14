import os
import math
import json
import redis
import requests
import joblib
import networkx as nx
import numpy as np
from celery import shared_task

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.Redis.from_url(REDIS_URL)
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "accel_lr.joblib")


def _result(value, status):
    return {"value": value, "status": status}


def haversine_distance(lat1, lon1, lat2, lon2):
    r = 6371e3
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def signal_6_gps_coherence(gps_trace):
    try:
        if not gps_trace or len(gps_trace) < 2:
            return _result(None, "missing_data")

        coords_str = ";".join([f"{pt['lng']},{pt['lat']}" for pt in gps_trace])
        url = f"http://router.project-osrm.org/match/v1/driving/{coords_str}"
        resp = requests.get(url, timeout=5)

        if resp.status_code == 200:
            data = resp.json()
            matchings = data.get("matchings", [])
            if not matchings:
                return _result(1.0, "computed")
            confidence = float(matchings[0].get("confidence", 0.0))
            return _result(max(0.0, min(1.0, 1.0 - confidence)), "computed")

        return _result(None, "error")
    except Exception:
        return _result(None, "error")


def signal_7_cell_discordance(gps_lat, gps_lng, cell_lat, cell_lng):
    if cell_lat is None or cell_lng is None:
        return _result(None, "missing_data")

    try:
        dist = haversine_distance(gps_lat, gps_lng, cell_lat, cell_lng)
        if dist <= 800:
            return _result(0.0, "computed")
        if dist >= 1500:
            return _result(1.0, "computed")
        return _result((dist - 800) / 700.0, "computed")
    except Exception:
        return _result(None, "error")


def signal_8_accelerometer(x_var, y_var, z_var, mock_mode=False):
    if x_var is None or y_var is None or z_var is None:
        return _result(None, "missing_data")

    try:
        if mock_mode:
            if x_var < 0.01 and y_var < 0.01 and z_var < 0.01:
                return _result(1.0, "computed")
            return _result(0.0, "computed")

        total_var = x_var + y_var + z_var
        if total_var < 0.005:
            return _result(1.0, "computed")

        if not os.path.exists(MODEL_PATH):
            return _result(None, "missing_data")

        model = joblib.load(MODEL_PATH)
        x = np.array([[x_var, y_var, z_var]])
        probs = model.predict_proba(x)
        return _result(float(probs[0][1]), "computed")
    except Exception:
        return _result(None, "error")


def signal_10_coordinated_ring(worker_id, context_edges):
    if not worker_id:
        return _result(None, "missing_data")

    try:
        graph_key = "fraud_graph_state"
        cached_graph = redis_client.get(graph_key)

        if cached_graph:
            data = json.loads(cached_graph)
            graph = nx.node_link_graph(data)
        else:
            graph = nx.Graph()

        graph.add_node(worker_id)

        for edge in context_edges or []:
            other_id = edge.get("worker_id")
            edge_types = edge.get("edge_types", [])
            if not other_id:
                continue

            graph.add_node(other_id)
            if graph.has_edge(worker_id, other_id):
                existing_types = set(graph[worker_id][other_id].get("types", []))
                existing_types.update(edge_types)
                graph[worker_id][other_id]["types"] = list(existing_types)
            else:
                graph.add_edge(worker_id, other_id, types=list(edge_types))

        redis_client.setex(graph_key, 600, json.dumps(nx.node_link_data(graph)))

        score = 0.0
        for comp in nx.connected_components(graph):
            if worker_id in comp:
                subgraph = graph.subgraph(comp)
                strong_edges = [u for u, v, d in subgraph.edges(data=True) if len(d.get("types", [])) >= 2]
                if len(comp) >= 5 and len(strong_edges) > 0:
                    score = min(len(comp) / 20.0, 1.0)

        return _result(float(score), "computed")
    except Exception:
        return _result(None, "error")


def signal_12_gps_anomaly(accuracies):
    try:
        if not accuracies or len(accuracies) < 2:
            return _result(None, "missing_data")

        all_same = all(x == accuracies[0] for x in accuracies)
        if all_same:
            return _result(1.0, "computed")

        variance = np.var(accuracies)
        if variance < 0.05:
            return _result(1.0, "computed")

        return _result(0.0, "computed")
    except Exception:
        return _result(None, "error")


@shared_task(name="tasks.evaluate_pass_two_ml")
def evaluate_pass_two_ml(context):
    worker_id = context.get("worker_id")
    gps_trace = context.get("gps_trace", [])
    gps_lat = context.get("gps_lat")
    gps_lng = context.get("gps_lng")
    cell_lat = context.get("cell_lat")
    cell_lng = context.get("cell_lng")
    accel = context.get("accelerometer", {})
    context_edges = context.get("context_edges", [])
    accuracies = context.get("accuracies", [])

    score_6 = signal_6_gps_coherence(gps_trace)
    score_7 = signal_7_cell_discordance(gps_lat, gps_lng, cell_lat, cell_lng)
    score_8 = signal_8_accelerometer(
        accel.get("x_var"),
        accel.get("y_var"),
        accel.get("z_var"),
        mock_mode=context.get("mock_mode", False),
    )
    score_10 = signal_10_coordinated_ring(worker_id, context_edges)
    score_12 = signal_12_gps_anomaly(accuracies)

    critical = False
    critical_values = [score_7["value"], score_10["value"], score_12["value"]]
    for value in critical_values:
      if value is not None and value >= 0.9:
          critical = True
          break

    return {
        "signal_6_gps_coherence": score_6["value"],
        "signal_7_cell_discordance": score_7["value"],
        "signal_8_accelerometer": score_8["value"],
        "signal_10_coordinated_ring": score_10["value"],
        "signal_12_gps_anomaly": score_12["value"],
        "signal_status": {
            "signal_6_gps_coherence": score_6["status"],
            "signal_7_cell_discordance": score_7["status"],
            "signal_8_accelerometer": score_8["status"],
            "signal_10_coordinated_ring": score_10["status"],
            "signal_12_gps_anomaly": score_12["status"],
        },
        "critical_flag": critical,
    }
