import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getCurrentUser, updateUserProfile, UserProfile } from "@/services/users";
import { User, Mail, Briefcase, Building, Phone, Globe } from "lucide-react";

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    avatar_url: "",
    role: "",
    department: "",
    phone: "",
    timezone: "",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await getCurrentUser();
      setProfile(data);
      setFormData({
        name: data.name || "",
        email: data.email || "",
        avatar_url: data.avatar_url || "",
        role: data.role || "",
        department: data.department || "",
        phone: data.phone || "",
        timezone: data.timezone || "",
      });
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updated = await updateUserProfile(formData);
      setProfile(updated);
      setEditing(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile) {
    return <div className="container mx-auto p-6">Loading profile...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Profile</h1>
        <p className="text-muted-foreground">Manage your profile information</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Personal Information</CardTitle>
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setEditing(false);
                  if (profile) {
                    setFormData({
                      name: profile.name || "",
                      email: profile.email || "",
                      avatar_url: profile.avatar_url || "",
                      role: profile.role || "",
                      department: profile.department || "",
                      phone: profile.phone || "",
                      timezone: profile.timezone || "",
                    });
                  }
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url || "/avatar.png"} alt={profile?.name || "User"} />
              <AvatarFallback className="text-2xl">
                {profile?.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            {editing && (
              <div className="space-y-2">
                <Label htmlFor="avatar_url">Avatar URL</Label>
                <Input
                  id="avatar_url"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.png"
                />
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                <User className="h-4 w-4 inline mr-2" />
                Name
              </Label>
              {editing ? (
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              ) : (
                <p className="text-sm py-2">{profile?.name || "—"}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                <Mail className="h-4 w-4 inline mr-2" />
                Email
              </Label>
              {editing ? (
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              ) : (
                <p className="text-sm py-2">{profile?.email || "—"}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">
                <Briefcase className="h-4 w-4 inline mr-2" />
                Role
              </Label>
              {editing ? (
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              ) : (
                <p className="text-sm py-2">{profile?.role || "—"}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">
                <Building className="h-4 w-4 inline mr-2" />
                Department
              </Label>
              {editing ? (
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              ) : (
                <p className="text-sm py-2">{profile?.department || "—"}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                <Phone className="h-4 w-4 inline mr-2" />
                Phone
              </Label>
              {editing ? (
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              ) : (
                <p className="text-sm py-2">{profile?.phone || "—"}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">
                <Globe className="h-4 w-4 inline mr-2" />
                Timezone
              </Label>
              {editing ? (
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  placeholder="UTC"
                />
              ) : (
                <p className="text-sm py-2">{profile?.timezone || "—"}</p>
              )}
            </div>
          </div>

          {profile && (
            <div className="pt-4 border-t text-sm text-muted-foreground">
              <p>Member since: {new Date(profile.created_at).toLocaleDateString()}</p>
              <p>Last updated: {new Date(profile.updated_at).toLocaleDateString()}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

