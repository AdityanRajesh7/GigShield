import os
import joblib
import numpy as np
from celery import shared_task

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "fraud_xgb.joblib")

@shared_task(name="tasks.evaluate_pipeline_xgb")
def evaluate_pipeline_xgb(signals_dict):
    """
    Accepts a dictionary of 12 signal scores:
    [
        'gps_match', 'weather_correlation', 'peer_activity', 'historical_pattern', 'device_fingerprint',
        'signal_6_gps_coherence', 'signal_7_cell_discordance', 'signal_8_accelerometer', 
        'signal_9_pre_disruption', 'signal_10_coordinated_ring', 'signal_11_zone_novelty', 'signal_12_gps_anomaly'
    ]
    Missing features are passed as NaN so model-side handling is explicit.
    """
    try:
        keys = [
            'gps_match', 'weather_correlation', 'peer_activity', 'historical_pattern', 'device_fingerprint',
            'signal_6_gps_coherence', 'signal_7_cell_discordance', 'signal_8_accelerometer', 
            'signal_9_pre_disruption', 'signal_10_coordinated_ring', 'signal_11_zone_novelty', 'signal_12_gps_anomaly'
        ]
        
        feature_vector = []
        for k in keys:
            raw = signals_dict.get(k)
            if raw is None:
                feature_vector.append(np.nan)
            else:
                feature_vector.append(float(raw))
            
        X = np.array([feature_vector])
        
        if not os.path.exists(MODEL_PATH):
            # Model unavailable: return explicit missing signal rather than synthetic score.
            return {
                "fraud_probability": None,
                "feature_importances": {},
                "available_features": int(sum(0 if np.isnan(v) else 1 for v in feature_vector)),
                "total_features": len(keys),
                "error": "model_not_found"
            }
            
        model = joblib.load(MODEL_PATH)
        
        # probability of class 1 (fraud)
        probs = model.predict_proba(X)
        fraud_prob = float(probs[0][1])
        
        # Get feature importances
        importances = model.feature_importances_
        feature_importances = {keys[i]: float(importances[i]) for i in range(len(keys))}
        available_features = int(sum(0 if np.isnan(v) else 1 for v in feature_vector))
        
        return {
            "fraud_probability": fraud_prob,
            "feature_importances": feature_importances,
            "available_features": available_features,
            "total_features": len(keys)
        }
    except Exception as e:
        return {
            "fraud_probability": None,
            "feature_importances": {},
            "available_features": 0,
            "total_features": 12,
            "error": str(e)
        }
