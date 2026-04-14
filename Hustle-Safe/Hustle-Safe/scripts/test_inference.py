import joblib
import numpy as np
import warnings

# Suppress scikit-learn feature name warnings for clean output
warnings.filterwarnings("ignore", category=UserWarning)

def test_model():
    model_path = "artifacts/api-server/models/fraud_xgb.joblib"
    print(f"Loading model from {model_path}...\n")
    
    try:
        model = joblib.load(model_path)
    except FileNotFoundError:
        print("❌ Model not found! Did you run train_fraud_models.py first?")
        return

    # --- EDIT THESE 12 VALUES TO TEST DIFFERENT SCENARIOS ---
    # All values must be floats between 0.0 and 1.0
    # 0.0 = completely normal/safe, 1.0 = highly suspicious/fraudulent
    
    test_signals = [
        0.1,  # Signal 1: GPS Match (0.1 = inside zone)
        0.0,  # Signal 2: Weather (0.0 = raining/stormy)
        0.2,  # Signal 3: Peer Activity
        0.3,  # Signal 4: Historical Pattern
        0.0,  # Signal 5: Device Fingerprint (0.0 = unique device)
        0.1,  # Signal 6: Trajectory Coherence
        0.2,  # Signal 7: Cell Discordance
        0.4,  # Signal 8: Accelerometer (0.4 = moving scooter)
        0.1,  # Signal 9: Pre-Shift Verification
        0.0,  # Signal 10: Ring Detection (0.0 = isolated)
        0.2,  # Signal 11: Zone Novelty
        0.1   # Signal 12: App Integrity
    ]

    # XGBoost expects a 2D array: [ [val1, val2, ... val12] ]
    input_data = np.array([test_signals])

    # Get the probability of Class 1 (Fraud)
    fraud_probability = model.predict_proba(input_data)[0][1]

    print("--- Test Values ---")
    for i, val in enumerate(test_signals):
        print(f"Signal {i+1:02d}: {val}")

    print("\n--- Prediction ---")
    print(f"Final Fraud Probability: {fraud_probability:.2%}")

    # Display how the pipeline will interpret this
    if fraud_probability < 0.40:
        print("Expected Pipeline Action: ✅ TIER 1 - AUTO APPROVE")
    elif fraud_probability < 0.72:
        print("Expected Pipeline Action: ⚠️ TIER 2/3 - AMBER (Request Evidence)")
    else:
        print("Expected Pipeline Action: 🚨 TIER 4/5 - INSURER REVIEW / REJECT")

if __name__ == "__main__":
    test_model()