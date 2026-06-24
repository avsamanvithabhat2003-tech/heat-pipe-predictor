# Heat Pipe Dimension Predictor

This local interface predicts heat-pipe dimensions from a target thermal resistance and operating conditions using the supplied `Final_combined_datapoints.xlsx` dataset.

## Inputs

- Thermal Resistance (K/W)
- Heat Input, Q (W)
- Inclination Angle (deg)
- Filling Ratio (%)
- Number of Turns, N
- Neighbor Count

## Outputs

- Inner Diameter, Di (mm)
- Outer Diameter, Do (mm)
- Evaporator Length, Le (mm)
- Condenser Length, Lc (mm)
- Nearest experimental matches for traceability

## Method

The app uses an inverse nearest-neighbor estimator. It standardizes the input features, finds the closest experimental records, and reports inverse-distance weighted geometry values. This is transparent and suitable as an initial research-paper demonstration interface. A later version can replace the estimator with a trained multi-output regression model if you want a formal ML deployment.

## Open

Open `index.html` directly in a browser, or serve this folder locally and visit the shown localhost URL.
