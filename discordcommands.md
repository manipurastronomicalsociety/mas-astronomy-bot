# 🚀 MAS Discord Bot Commands Guide

Welcome to the **Manipur Astronomical Society Discord Bot**! This comprehensive guide covers all available commands for admins, members, and the community.

---

## 👥 **PUBLIC COMMANDS** (Available to Everyone)

### **Member Verification & Status**
- `/verify email:your@email.com`
  - **Purpose**: Verify your MAS membership using your registered email
  - **Example**: `/verify email:john@gmail.com`
  - **Note**: Email must match your approved membership application

- `/status`
  - **Purpose**: Check your current MAS membership status on Discord
  - **Shows**: Verification status, member role, access level

### **Events & Registration**
- `/events`
  - **Purpose**: Show upcoming MAS events
  - **Displays**: Event list with dates, locations, and details

- `/register event-slug:event-id name:"Full Name" email:your@email.com phone:"+91 98765 43210" status:Student education:"Bachelor's" message:"Any questions"`
  - **Purpose**: Register for a MAS event
  - **Required**: event-slug, name, email, phone, status, education
  - **Optional**: message (for questions or special requirements)
  - **Status Options**: Student, Professional, Teacher/Educator, Researcher, Other

- `/my-events email:your@email.com`
  - **Purpose**: Show your registered events
  - **Example**: `/my-events email:john@gmail.com`

- `/event-details event-slug:event-id`
  - **Purpose**: Get detailed information about a specific event
  - **Example**: `/event-details event-slug:stargazing-2024`

### **Fun & Educational Commands**
- `/spacejoke`
  - **Purpose**: Get a random space-themed joke to brighten your day! 🚀😄

- `/yourage age:25 planet:Mars`
  - **Purpose**: Calculate your age on different planets in our solar system!
  - **Age Range**: 1-150 years
  - **Planets**: Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune

- `/spacemusic`
  - **Purpose**: Listen to real sounds from space recorded by NASA! 🎵🛰️

- `/astronomer`
  - **Purpose**: Learn about a famous astronomer and their contributions to science! 👨‍🚀🔭

- `/resources type:general`
  - **Purpose**: Find the best free astronomy educational resources for students! 📚🔭
  - **Types**: General Education, Free Courses, Research Papers, Indian Institutions

---

## 🛡️ **ADMIN COMMANDS** (Admin Access Required)

### **Member Management**
- `/member-list status:all`
  - **Purpose**: List MAS members with optional status filtering
  - **Status Options**: All (default), Pending Review, Approved, Rejected
  - **Example**: `/member-list status:approved`

- `/member-info user:@username`
  - **Purpose**: Get detailed information about a member
  - **Shows**: Membership details, verification status, registration info

- `/member-status email:member@email.com action:approve reason:"Application review complete"`
  - **Purpose**: Change membership application status
  - **Actions**: Approve Application, Reject Application, Set to Pending
  - **Required**: email, action
  - **Optional**: reason (recommended for transparency)

- `/admin-verify user:@username email:member@email.com`
  - **Purpose**: Manually verify a member by connecting their Discord to their email
  - **Use Cases**: When members have trouble with self-verification
  - **Features**: Auto-assigns roles, grants channel access, prevents duplicates

### **Email & Communication**
- `/send-welcome-emails filter:unverified email:specific@email.com`
  - **Purpose**: Send welcome emails to approved members who haven't joined Discord
  - **Filter Options**:
    - `unverified`: All approved members not Discord verified
    - `all`: All approved members
    - `specific`: Specific member by email
    - `test`: Send test email to admin
  - **Example**: `/send-welcome-emails filter:unverified`

### **Announcements & Moderation**
- `/announce title:"Event Reminder" message:"Don't forget about tonight's stargazing session!" channel:#general type:event`
  - **Purpose**: Send a formatted announcement
  - **Required**: title, message
  - **Optional**: channel (default: current), type
  - **Types**: General, Event, Important, Emergency

- `/clean-chat count:10 user:@username`
  - **Purpose**: Delete recent messages from this channel
  - **Count Range**: 1-100 messages
  - **Optional**: user (only delete from specific user)
  - **Example**: `/clean-chat count:5`

- `/poll question:"Favorite planet?" option1:"Mars" option2:"Jupiter" option3:"Saturn" duration:24h channel:#polls`
  - **Purpose**: Create a poll for community engagement
  - **Required**: question, option1, option2
  - **Optional**: option3, option4, duration, channel
  - **Duration Options**: 1h, 6h, 24h, 3d, 1w

---

## 👑 **SUPER ADMIN COMMANDS** (Super Admin Only)

### **Admin Management**
- `/add-admin user:@username notes:"Event coordinator"`
  - **Purpose**: Grant admin permissions to a user
  - **Required**: user
  - **Optional**: notes (role description)

- `/remove-admin user:@username reason:"Role restructuring"`
  - **Purpose**: Remove admin permissions from a user
  - **Required**: user
  - **Optional**: reason

- `/list-admins`
  - **Purpose**: List all current admins and their details

### **Web Admin Management**
- `/add-web-admin email:admin@email.com name:"John Doe" role:admin events:true membership:true contacts:false newsletter:true registrations:true articles:false settings:false`
  - **Purpose**: Create a new web admin account with custom permissions
  - **Required**: email, name, role
  - **Role Options**: Admin (Custom Permissions), Moderator (Limited)
  - **Permissions**: events, membership, contacts, newsletter, registrations, articles, settings

- `/remove-web-admin email:admin@email.com reason:"Role change"`
  - **Purpose**: Remove web admin access
  - **Required**: email
  - **Optional**: reason

- `/list-web-admins`
  - **Purpose**: List all web admins and their permissions

- `/update-web-admin email:admin@email.com role:moderator events:false membership:true`
  - **Purpose**: Update web admin permissions
  - **Required**: email
  - **Optional**: All permission fields and role

---

## 🔐 **Security & Access Levels**

### **Permission Hierarchy**
1. **Public Users**: Basic commands (verify, events, fun commands)
2. **Verified Members**: All public commands + member benefits
3. **Admins**: All commands except super admin functions
4. **Super Admins**: Full access to all commands

### **Important Security Notes**
- All admin commands are logged with timestamps and user info
- Sensitive operations require explicit confirmation
- Commands are rate-limited to prevent abuse
- Failed permission attempts are logged for security monitoring

---

## 💡 **Pro Tips for Admins**

### **Efficient Member Management**
1. Use `/member-list status:pending` to see applications needing review
2. Use `/admin-verify` for members struggling with self-verification
3. Use `/send-welcome-emails filter:unverified` to boost Discord adoption

### **Event Management**
1. Create events through the web admin panel first
2. Use `/announce type:event` to promote events
3. Monitor registrations through `/event-details`

### **Community Engagement**
1. Use `/poll` for community decisions
2. Share `/spacejoke` and `/resources` in conversations
3. Use `/yourage` and `/astronomer` for educational moments

### **Troubleshooting**
1. Use `/member-info` to diagnose user issues
2. Check `/status` output for verification problems
3. Use `/clean-chat` sparingly and with purpose

---

## 📞 **Support & Questions**

If you encounter any issues with commands:
1. Check your permission level
2. Verify command syntax with this guide
3. Contact super admins for assistance
4. Report bugs in the admin channel

**Bot Status**: 🟢 Online and Monitoring
**Last Updated**: Commands deployed and active
**Total Commands**: 26 slash commands available

---

*This guide is maintained by the MAS Discord Admin Team. Please keep this information secure and use commands responsibly.*