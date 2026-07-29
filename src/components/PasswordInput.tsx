import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";

type PasswordInputProps = Omit<
  TextInputProps,
  "editable" | "onChangeText" | "secureTextEntry" | "value"
> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  disabled?: boolean;
};

export function PasswordInput({
  label,
  value,
  onChangeText,
  isVisible,
  onToggleVisibility,
  disabled = false,
  accessibilityLabel,
  accessibilityState,
  style,
  ...inputProps
}: PasswordInputProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const toggleLabel = isVisible ? "Hide password" : "Show password";

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, disabled && styles.fieldDisabled]}>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!isVisible}
          editable={!disabled}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{
            ...accessibilityState,
            disabled,
          }}
          style={[styles.input, disabled && styles.inputDisabled, style]}
        />
        <Pressable
          onPress={onToggleVisibility}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ disabled }}
          accessibilityValue={{
            text: isVisible ? "Password visible" : "Password hidden",
          }}
          style={({ pressed }) => [
            styles.toggle,
            pressed && !disabled && styles.togglePressed,
          ]}
        >
          <SymbolView
            name={
              isVisible
                ? { ios: "eye", android: "visibility", web: "visibility" }
                : {
                    ios: "eye.slash",
                    android: "visibility_off",
                    web: "visibility_off",
                  }
            }
            size={22}
            tintColor={
              disabled ? theme.colors.disabledText : theme.colors.accent
            }
            fallback={
              <Text
                style={[
                  styles.fallback,
                  disabled && styles.fallbackDisabled,
                ]}
              >
                {isVisible ? "Hide" : "Show"}
              </Text>
            }
          />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },
    field: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      marginBottom: 14,
      overflow: "hidden",
    },
    fieldDisabled: {
      backgroundColor: colors.disabled,
    },
    input: {
      flex: 1,
      minWidth: 0,
      paddingLeft: 18,
      paddingRight: 12,
      paddingVertical: 16,
      fontSize: 16,
      color: colors.text,
    },
    inputDisabled: {
      color: colors.disabledText,
    },
    toggle: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    togglePressed: {
      opacity: 0.65,
    },
    fallback: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "700",
    },
    fallbackDisabled: {
      color: colors.disabledText,
    },
  });
}
