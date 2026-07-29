import { Alert, Platform } from "react-native";

export type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
};

export function confirmAction({
  title,
  message,
  confirmLabel,
  destructive = false,
}: ConfirmationOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (confirmed: boolean) => {
      if (!settled) {
        settled = true;
        resolve(confirmed);
      }
    };

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => settle(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => settle(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => settle(false),
      },
    );
  });
}
