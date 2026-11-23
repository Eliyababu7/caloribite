import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { createFoodLogStorage } from "./foodLogStorage";
import { foodLogCoordination } from "./platformFoodLogCoordination";

export const foodLogStorage = createFoodLogStorage(AsyncStorage, randomUUID, foodLogCoordination);
