import os
import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
import xgboost as xgb

def train_and_save_model():
    print("Generating synthetic accelerometer variance data...")
    np.random.seed(42)

    # Class 0: "moving scooter" (high variance)
    n_moving = 500
    x_var_0 = np.random.normal(2.5, 0.8, n_moving)
    y_var_0 = np.random.normal(3.0, 1.0, n_moving)
    z_var_0 = np.random.normal(2.0, 0.6, n_moving)
    X_moving = np.column_stack((x_var_0, y_var_0, z_var_0))
    y_moving = np.zeros(n_moving)

    # Class 1: "stationary phone" (near-zero variance)
    n_stationary = 500
    x_var_1 = np.random.normal(0.1, 0.05, n_stationary)
    y_var_1 = np.random.normal(0.1, 0.05, n_stationary)
    z_var_1 = np.random.normal(0.1, 0.05, n_stationary)
    X_stationary = np.column_stack((x_var_1, y_var_1, z_var_1))
    y_stationary = np.ones(n_stationary)

    X = np.vstack((X_moving, X_stationary))
    y = np.concatenate((y_moving, y_stationary))

    # Train model
    print("Training LogisticRegression model for Accelerometer Motion Signature...")
    model = LogisticRegression()
    model.fit(X, y)

    # Save model
    model_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        "artifacts", "api-server", "models"
    )
    os.makedirs(model_dir, exist_ok=True)
    
    model_path = os.path.join(model_dir, "accel_lr.joblib")
    joblib.dump(model, model_path)
    
    print(f"Model saved successfully to {model_path}\n")

def train_xgboost_model():
    print("Generating advanced synthetic XGBoost data for 12 signals...")
    np.random.seed(42)
    
    # ---------------------------------------------------------
    # 1. LEGITIMATE CLAIMS (500 samples)
    # Most signals are low (Beta 2,5)
    # ---------------------------------------------------------
    X_legit = np.random.beta(2, 5, (500, 12))
    y_legit = np.zeros(500)
    
    # ---------------------------------------------------------
    # 2. FRAUDULENT CLAIMS (500 samples across 4 Archetypes)
    # ---------------------------------------------------------
    
    # Archetype A: General Blatant Fraud (125 samples)
    # Almost everything looks a bit suspicious
    X_fraud_gen = np.random.beta(6, 2, (125, 12))
    
    # Archetype B: "The Couch Potato" (125 samples)
    # Weather is real, but they aren't in the zone and aren't moving
    X_fraud_couch = np.random.beta(2, 5, (125, 12)) # Start looking legit
    X_fraud_couch[:, 0] = np.random.beta(8, 2, 125) # Signal 1: Bad GPS Match
    X_fraud_couch[:, 5] = np.random.beta(8, 2, 125) # Signal 6: Bad Trajectory
    X_fraud_couch[:, 7] = np.random.beta(8, 2, 125) # Signal 8: Stationary Accel
    X_fraud_couch[:, 8] = np.random.beta(8, 2, 125) # Signal 9: Not in zone pre-shift
    
    # Archetype C: "The Chronic Abuser" (125 samples)
    # Perfect physical sensors, but terrible history, clear weather, active peers
    X_fraud_abuse = np.random.beta(1.5, 6, (125, 12)) # Start looking physically perfect
    X_fraud_abuse[:, 1] = np.random.beta(8, 2, 125) # Signal 2: Clear Weather
    X_fraud_abuse[:, 2] = np.random.beta(8, 2, 125) # Signal 3: Peers are active
    X_fraud_abuse[:, 3] = np.random.beta(8, 2, 125) # Signal 4: High claim history
    X_fraud_abuse[:, 4] = np.random.beta(8, 2, 125) # Signal 5: Shared Device ID
    X_fraud_abuse[:, 10] = np.random.beta(8, 2, 125) # Signal 11: Zone Novelty
    
    # Archetype D: "The Tech Spoofer / Crime Ring" (125 samples)
    # Using mock GPS apps and working in organized clusters
    X_fraud_tech = np.random.beta(2, 5, (125, 12))
    X_fraud_tech[:, 6] = np.random.beta(8, 2, 125) # Signal 7: Cell Tower Discordance
    X_fraud_tech[:, 9] = np.random.beta(8, 2, 125) # Signal 10: Ring Detected
    X_fraud_tech[:, 11] = np.random.beta(8, 2, 125) # Signal 12: App Integrity (Fake GPS)
    
    # Combine all fraud archetypes
    X_fraud = np.vstack((X_fraud_gen, X_fraud_couch, X_fraud_abuse, X_fraud_tech))
    y_fraud = np.ones(500)
    
    # Combine Legit and Fraud
    X = np.vstack((X_legit, X_fraud))
    y = np.concatenate((y_legit, y_fraud))

    print("Training XGBoost Classifier...")
    # Increased max_depth slightly to help it learn the complex if/then rules of our archetypes
    model = xgb.XGBClassifier(
        eval_metric='logloss', 
        use_label_encoder=False, 
        random_state=42,
        max_depth=5 
    )
    model.fit(X, y)
    
    model_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        "artifacts", "api-server", "models"
    )
    os.makedirs(model_dir, exist_ok=True)
    
    model_path = os.path.join(model_dir, "fraud_xgb.joblib")
    joblib.dump(model, model_path)
    
    print(f"XGBoost model saved successfully to {model_path}")

if __name__ == "__main__":
    train_and_save_model()
    train_xgboost_model()