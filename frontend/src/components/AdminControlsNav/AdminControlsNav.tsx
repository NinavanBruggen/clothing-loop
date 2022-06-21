import { Link } from "react-router-dom";
import { useContext } from "react";
import { useTranslation } from "react-i18next";

// Material UI
import { Typography, Button } from "@mui/material";
import { makeStyles } from "@mui/styles";

import theme from "../../util/theme";

//Resources
import Img from "../../images/Denise.png";
import { TwoColumnLayout } from "../Layouts";
import { AuthContext } from "../AuthProvider";

const AdminControlsNav = () => {
  const { t } = useTranslation();

  const classes = makeStyles(theme as any)();
  const { userData } = useContext(AuthContext);

  return (
    <div>
      {userData ? (
        <TwoColumnLayout img={Img}>
          <div className="tw-ml-12 tw-pt-20">
            <Typography variant="h3" className={classes.pageTitle}>
              {`Hello, ${userData?.name}`}
            </Typography>
            <div className={classes.pageDescription}>
              <Typography component="p" className={classes.p}>
                {t("thankYouForBeingHere")}
              </Typography>
            </div>

            <div className="tw-flex tw-flex-col tw-items-center tw-pt-5 tw-gap-8">
              {userData?.role === "chainAdmin" ? (
                <div className="tw-flex tw-flew-col tw-gap-8">
                  <Button
                    color="inherit"
                    className={classes.button}
                    component={Link}
                    to={`/loops/${userData.chainId}/members`}
                  >
                    {t("viewLoop")}
                  </Button>
                </div>
              ) : null}

              {userData?.role === "admin" ? (
                <div className="tw-flex tw-flew-col tw-gap-8">
                  <Button
                    color="inherit"
                    className={classes.button}
                    component={Link}
                    to="/loops"
                  >
                    {t("viewLoops")}
                  </Button>
                </div>
              ) : null}

              <Link
                className={classes.underlinedLink}
                target="_blank"
                to={{
                  pathname:
                    "https://drive.google.com/drive/folders/1iMJzIcBxgApKx89hcaHhhuP5YAs_Yb27",
                }}
              >
                {t("goToTheToolkitFolder")}
              </Link>
            </div>
          </div>
        </TwoColumnLayout>
      ) : null}
    </div>
  );
};

export default AdminControlsNav;
