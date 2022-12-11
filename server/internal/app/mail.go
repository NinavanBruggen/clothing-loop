package app

import (
	"crypto/tls"
	"errors"
	"fmt"
	"net/http"
	"net/smtp"

	"github.com/CollActionteam/clothing-loop/server/internal/app/gin_utils"
	"github.com/CollActionteam/clothing-loop/server/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/jordan-wright/email"
	"gopkg.in/guregu/null.v3/zero"
	"gorm.io/gorm"
)

var smtpAddr string
var smtpAuth smtp.Auth

func MailInit() {
	smtpAddr = fmt.Sprintf("%s:%d", Config.SMTP_HOST, Config.SMTP_PORT)
	smtpAuth = smtp.PlainAuth("", Config.SMTP_SENDER, Config.SMTP_PASS, Config.SMTP_HOST)
}

func MailSend(c *gin.Context, db *gorm.DB, to string, subject string, body string) bool {
	if Config.ENV != EnvEnumProduction {
		to = "hello@clothingloop.org"
	}

	e := email.NewEmail()
	e.From = fmt.Sprintf("The Clothing Loop <%s>", Config.SMTP_SENDER)
	e.To = []string{to}
	e.Bcc = []string{}
	e.Cc = []string{}
	e.Subject = subject
	e.Text = []byte("")
	e.HTML = []byte(body)
	var err error
	switch Config.SMTP_PORT {
	case 465, 587:
		err = e.SendWithStartTLS(smtpAddr, smtpAuth, &tls.Config{
			InsecureSkipVerify: true,
		})
		// err = e.SendWithTLS(smtpAddr, smtpAuth, &tls.Config{
		// 	InsecureSkipVerify: true,
		// })
	default:
		err = e.Send(smtpAddr, smtpAuth)
	}

	db.Create(&models.Mail{
		To:      to,
		Subject: subject,
		Body:    body,
		Error:   zero.StringFrom(fmt.Sprint(err)),
	})

	if err != nil {
		c.Error(err)
		gin_utils.GinAbortWithErrorBody(c, http.StatusInternalServerError, errors.New("Unable to send email"))
		return false
	}

	return true
}
