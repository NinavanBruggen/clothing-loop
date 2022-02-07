import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {UserRecord} from "firebase-functions/lib/providers/auth";

admin.initializeApp();

const db = admin.firestore();
const region = functions.config().clothingloop.region as string;
const adminEmails = (
  functions.config().clothingloop.admin_emails as string
).split(";");

const ROLE_ADMIN = "admin";
const ROLE_CHAINADMIN = "chainAdmin";

// https://github.com/firebase/firebase-js-sdk/issues/1881
// If we want to use try/catch with auth functions, we have to wrap it in this
// Auth functions return a "clojure" promise which has a different catch implementation
function wrapInECMAPromise<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    return fn()
      .then((res) => resolve(res))
      .catch((err) => reject(err));
  });
}

export const createUser = functions
  .region(region)
  .https.onCall(async (data: any) => {
    functions.logger.debug("createUser parameters", data);
    const [
      email,
      chainId,
      name,
      phoneNumber,
      newsletter,
      interestedSizes,
      address,
    ] = [
      data.email,
      data.chainId,
      data.name,
      data.phoneNumber,
      data.newsletter,
      data.interestedSizes,
      data.address,
    ];
    let userRecord = null as null | UserRecord;
    try {
      userRecord = await wrapInECMAPromise<UserRecord>(() =>
        admin.auth().createUser({
          email: email,
          phoneNumber: phoneNumber,
          displayName: name,
          disabled: false,
        })
      );
    } catch (e) {
      functions.logger.warn(`Error creating user: ${JSON.stringify(e)}`);
      return {validationError: e};
    }
    functions.logger.debug("created user", userRecord);
    const verificationLink = await admin
      .auth()
      .generateEmailVerificationLink(email, {
        handleCodeInApp: false,
        url: functions.config().clothingloop.base_domain,
      });
    const verificationEmail =
      `Hi ${name},<br><br>` +
      `Click <a href="${verificationLink}">here</a> to verify your e-mail and activate your clothing-loop account.<br><br>` +
      "Regards,<br>The clothing-loop team!";
    functions.logger.debug("sending verification email", verificationEmail);
    await db.collection("mail").add({
      to: email,
      message: {
        subject: "Verify e-mail for clothing chain",
        html: verificationEmail,
      },
    });
    functions.logger.debug("Adding user supplemental information to firebase");
    await db.collection("users").doc(userRecord.uid).set({
      chainId,
      address,
      newsletter,
      interestedSizes,
    });
    if (adminEmails.includes(email)) {
      functions.logger.debug(`Adding user ${email} as admin`);
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        role: ROLE_ADMIN,
        chainId: chainId,
      });
    } else {
      await admin
        .auth()
        .setCustomUserClaims(userRecord.uid, {chainId: chainId});
    }
    // TODO: Subscribe user in mailchimp if needed
    return {id: userRecord.uid};
  });

export const createChain = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("createChain parameters", data);

    const [
      uid,
      name,
      description,
      address,
      latitude,
      longitude,
      radius,
      categories,
    ] = [
      data.uid,
      data.name,
      data.description,
      data.address,
      data.latitude,
      data.longitude,
      data.radius,
      data.categories,
    ];

    const user = await admin.auth().getUser(uid);
    const userData = await db.collection("users").doc(uid).get();
    if (
      (!userData.get("chainId") &&
        !user.customClaims?.chainId &&
        user.customClaims?.role !== ROLE_CHAINADMIN) ||
      context.auth?.token.role === ROLE_ADMIN
    ) {
      const chainData = await db.collection("chains").add({
        name,
        description,
        address,
        latitude,
        longitude,
        radius,
        categories,
        published: false,
        chainAdmin: uid,
      });
      db.collection("users").doc(uid).update("chainId", chainData.id);
      await admin.auth().setCustomUserClaims(uid, {
        chainId: chainData.id,
        role: user.customClaims?.role ?? ROLE_CHAINADMIN,
      });
      return {id: chainData.id};
    } else {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You don't have permission to change this user's chain"
      );
    }
  });

export const addUserToChain = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("updateUserToChain parameters", data);

    const {uid, chainId} = data;

    if (context.auth?.uid === uid || context.auth?.token?.role === ROLE_ADMIN) {
      const userReference = db.collection("users").doc(uid);
      if ((await userReference.get()).get("chainId") === chainId) {
        functions.logger.warn(
          `user ${uid} is already member of chain ${chainId}`
        );
      } else {
        await userReference.update("chainId", chainId);
        // When switching chains, you're no longer an chain-admin
        if (context.auth?.token?.role === ROLE_CHAINADMIN) {
          await admin.auth().setCustomUserClaims(uid, {chainId: chainId});
        } else {
          await admin.auth().setCustomUserClaims(uid, {
            chainId: chainId,
            role: context.auth?.token?.role,
          });
        }

        await notifyChainAdmin(chainId, uid);
      }
    } else {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You don't have permission to change this user's chain"
      );
    }
  });

const notifyChainAdmin = async (chainId: string, newUserId: string) => {
  const chain = await db.collection("chains").doc(chainId).get();
  const chainAdminUid = await chain.get("chainAdmin");

  const chainAdmin = await admin.auth().getUser(chainAdminUid);
  const adminName = chainAdmin.displayName;
  const adminEmail = chainAdmin.email;

  const newUser = await admin.auth().getUser(newUserId);
  const name = newUser.displayName;
  const email = newUser.email;
  const phone = newUser.phoneNumber;

  await db.collection("mail").add({
    to: adminEmail,
    message: {
      subject: "A participant just joined your Loop!",
      html: ` <p>Hi, ${adminName}</p>
                        <p>A new participant just joined your loop.</p>
                        <p>Please find below the participant's contact information:</p>
                        <ul>
                          <li>Name: ${name}</li>
                          <li>Email: ${email}</li>
                          <li>Phone: ${phone}</li>
                        </ul>
                        <p>Best,</p>
                        <p>The Clothing Loop team</p>
                `,
    },
  });
};

export const updateUser = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("updateUser parameters", data);
    const [uid, name, phoneNumber, newsletter, interestedSizes, address] = [
      data.uid,
      data.name,
      data.phoneNumber,
      data.newsletter,
      data.interestedSizes,
      data.address,
    ];

    if (context.auth?.uid === uid || context.auth?.token?.role === ROLE_ADMIN) {
      const userRecord = await admin.auth().updateUser(uid, {
        phoneNumber: phoneNumber,
        displayName: name,
        disabled: false,
      });
      functions.logger.debug("updated user", userRecord);
      await db.collection("users").doc(userRecord.uid).set(
        {
          address,
          newsletter,
          interestedSizes,
        },
        {merge: true}
      );
      // TODO: Update user in mailchimp if needed
      return {};
    } else {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You don't have permission to update this user"
      );
    }
  });

export const getUserById = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("getUserById parameters", data);
    const uid = data.uid;
    const user = await admin.auth().getUser(uid);
    if (
      user &&
      (context.auth?.uid === uid ||
        context.auth?.token?.role === ROLE_ADMIN ||
        (context.auth?.token?.role === ROLE_CHAINADMIN &&
          context.auth.token?.chainId === user.customClaims?.chainId))
    ) {
      const userData = await db.collection("users").doc(uid).get();
      return {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
        chainId: userData.get("chainId"),
        address: userData.get("address"),
        newsletter: userData.get("newsletter"),
        interestedSizes: userData.get("interestedSizes"),
        role: user.customClaims?.role,
      };
    } else {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You don't have permission to retrieve information about this user"
      );
    }
  });

export const getUserByEmail = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("getUserByEmail parameters", data);
    const email = data.email;
    const user = await admin.auth().getUserByEmail(email);
    if (
      user &&
      (context.auth?.uid === user.uid ||
        context.auth?.token?.role === ROLE_ADMIN ||
        (context.auth?.token?.role === ROLE_CHAINADMIN &&
          context.auth.token?.chainId === user.customClaims?.chainId))
    ) {
      const userData = await db.collection("users").doc(user.uid).get();
      return {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
        chainId: userData.get("chainId"),
        address: userData.get("address"),
        newsletter: userData.get("newsletter"),
        interestedSizes: userData.get("interestedSizes"),
        role: user.customClaims?.role,
      };
    } else {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You don't have permission to retrieve information about this user"
      );
    }
  });

export const contactMail = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("contactMail parameters", data);

    const [name, email, message] = [data.name, data.email, data.message];

    // send user message to the clothing loop team
    await db.collection("mail").add({
      to: functions.config().clothingloop.contact_emails.split(";"),
      message: {
        subject: `ClothingLoop Contact Form - ${name}`,
        html: ` <h3>Name</h3>
                    <p>${name}</p>
                    <h3>Email</h3>
                    <p>${email}</p>
                    <h3>Message</h3>
                    <p>${message}</p>
            `,
      },
    });

    // send confirmation mail to the user
    await db.collection("mail").add({
      to: email,
      message: {
        subject: "Thank you for contacting Clothing-Loop",
        html: ` <p>Hi ${name},</p>
                    <p>Thank you for your message!</p>
                    <p>You wrote:</p>
                    <p>${message}</p>
                    <p>We will contact you as soon as possible.</p>
                    <p>Regards,</p>
                    <p>The clothing-loop team!</p>
            `,
      },
    });
  });

export const subscribeToNewsletter = functions
  .region(region)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    functions.logger.debug("subscribeToNewsletter parameters", data);

    const {name, email} = data;

    await db.collection("interested_users").add({
      name,
      email,
    });

    await db.collection("mail").add({
      to: email,
      message: {
        subject: "Thank you for subscribing to Clothing Loop",
        html: ` <p>Hi ${name},</p>
                      <p>Thank you for subscribing!</p>
                      <p>Regards,</p>
                      <p>The clothing-loop team!</p>
              `,
      },
    });
  });