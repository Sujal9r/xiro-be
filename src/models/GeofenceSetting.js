import mongoose from "mongoose";

const geofenceSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },
    enabled: { type: Boolean, default: false },
    name: { type: String, default: "Office Area", trim: true },
    center: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    radiusMeters: { type: Number, default: 250 },
    enforceClockOut: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const GeofenceSetting = mongoose.model("GeofenceSetting", geofenceSettingSchema);

export default GeofenceSetting;
