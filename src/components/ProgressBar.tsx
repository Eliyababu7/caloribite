import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

import { useAppTheme } from "../theme/theme";
import { isNutritionNumber } from "../utils/formatNutrition";

type ProgressBarProps = {
  value: number;
  max: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ProgressBar({
  value,
  max,
  height = 10,
  trackColor,
  fillColor,
  style,
  accessibilityLabel = "Progress",
}: ProgressBarProps) {
  const theme = useAppTheme();

  const valid = isNutritionNumber(value) && isNutritionNumber(max);
  const safeValue = valid ? Math.max(value, 0) : 0;
  const safeMax = valid ? Math.max(max, 0) : 0;

  const percentage =
    safeMax > 0 ? Math.min((safeValue / safeMax) * 100, 100) : 0;

  const currentValue = Math.min(safeValue, safeMax);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={valid ? {
        min: 0,
        max: safeMax,
        now: currentValue,
      } : { text: "Unavailable" }}
      style={[
        styles.track,
        {
          height,
          backgroundColor: trackColor ?? theme.colors.progressTrack,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${percentage}%`,
            backgroundColor: fillColor ?? theme.colors.accent,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 999,
  },

  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
